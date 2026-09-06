import PDFDocument from 'pdfkit';
import { Dialogue, ScreenplayDoc } from './ast';

// US Letter, 12-point Courier: 10 characters/inch and 6 rows/inch.
const CHAR_W = 7.2;
const LINE_H = 12;
const PAGE_W = 612;
const PAGE_H = 792;
const M_LEFT = 108;
const M_RIGHT = 72;
const M_TOP = 72;
const BODY_CHARS = 60;
export const LINES_PER_PAGE = 54;
const IND = { dialog: 10, paren: 16, character: 22 };
const WIDTH = { action: BODY_CHARS, dialog: 35, paren: 30, character: 38 };
const DUAL = { width: 28, rightOffset: 32, cueIndent: 6, parenIndent: 3 };
// Leave one character of air between each number gutter and the body.
const SCENE_NUM_LEFT_X = 72;
const SCENE_NUM_RIGHT_X = 547.2;
const SCENE_NUM_WIDTH = 4;
type Font = 'Courier' | 'Courier-Bold' | 'Courier-Oblique';
interface Span { x: number; text: string; font?: Font }
interface DialogueColumn {
  character: string;
  cueX: number;
  cueWidth: number;
  body: (Span & { speech: boolean })[];
}
interface DialogueGroup { columns: DialogueColumn[]; cueRows: number; sourceLine: number }
export interface PLine {
  spans: Span[];
  keepWithNext?: number;
  forceBreak?: boolean;
  /** Zero-based source scene heading line; absent for pre-scene material. */
  sceneLine?: number;
  dlg?: DialogueGroup;
}

export function wrap(text: string, width: number): string[] {
  if (!Number.isInteger(width) || width < 1) throw new Error('Wrap width must be a positive integer.');
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      let w = word;
      while (w.length > width) {
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (line === '') line = w;
      else if (line.length + 1 + w.length <= width) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

// PDFKit's standard-font WinAnsi remapping, in addition to printable Latin-1.
const WIN_ANSI_EXTRA = new Set(Array.from('ƒ–—‘’‚“”„†‡•…€‰‹›ˆ™Œœ˜ŠšŸŽž'));
function preflight(text: string, source: string): void {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (char === '\n' || char === '\r' || char === '\t' ||
        (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(char)) continue;
    throw new Error(`Unsupported PDF character U+${code.toString(16).toUpperCase().padStart(4, '0')} in ${source}.`);
  }
}

function dialogueColumn(el: Dialogue, dual: boolean, right: boolean): DialogueColumn {
  const base = M_LEFT + (right ? DUAL.rightOffset * CHAR_W : 0);
  const character = el.character.toUpperCase();
  preflight(character, `line ${el.line + 1}`);
  const body: DialogueColumn['body'] = [];
  for (const part of el.parts) {
    preflight(part.text, `dialogue at line ${el.line + 1}`);
    const paren = part.type === 'parenthetical';
    const indent = dual ? (paren ? DUAL.parenIndent : 0) : (paren ? IND.paren : IND.dialog);
    const width = dual ? DUAL.width - indent : (paren ? WIDTH.paren : WIDTH.dialog);
    for (const text of wrap(paren ? `(${part.text})` : part.text, width)) {
      body.push({ x: base + indent * CHAR_W, text, speech: !paren && text.trim() !== '', font: part.type === 'lyric' ? 'Courier-Oblique' : undefined });
    }
  }
  return { character, body, cueX: base + (dual ? DUAL.cueIndent : IND.character) * CHAR_W,
    cueWidth: dual ? DUAL.width - DUAL.cueIndent : WIDTH.character };
}

function cueRows(columns: DialogueColumn[], continued: boolean): PLine[] {
  const wrapped = columns.map(column => wrap(column.character + (continued ? " (CONT'D)" : ''), column.cueWidth));
  return Array.from({ length: Math.max(0, ...wrapped.map(rows => rows.length)) }, (_, i) => ({
    spans: columns.flatMap((column, c) => wrapped[c][i] === undefined ? [] : [{ x: column.cueX, text: wrapped[c][i] }]),
  }));
}

/** Every continuing column must retain spoken text on both sides of a break. */
function canSplitDialogue(columns: DialogueColumn[], offset: number, end: number): boolean {
  return columns.every(column => end >= column.body.length ||
    (column.body.slice(offset, end).some(span => span.speech) && column.body.slice(end).some(span => span.speech)));
}

function minimumDialogueRows(group: DialogueGroup, offset: number, cueCount: number): number {
  const remaining = Math.max(...group.columns.map(column => column.body.length)) - offset;
  for (let take = remaining === 0 ? 0 : 1; take <= Math.min(remaining, LINES_PER_PAGE); take++) {
    if (canSplitDialogue(group.columns, offset, offset + take)) {
      const needed = cueCount + take + (take < remaining ? 1 : 0);
      if (needed <= LINES_PER_PAGE) return needed;
      break;
    }
  }
  throw new Error(`Dialogue at line ${group.sourceLine + 1} cannot fit on a PDF body page while retaining speech beside its cue and continuation markers.`);
}

function dialogueLines(left: Dialogue, right?: Dialogue): PLine[] {
  const columns = [dialogueColumn(left, !!right, false)];
  if (right) columns.push(dialogueColumn(right, true, true));
  const cues = cueRows(columns, false);
  const dlg: DialogueGroup = { columns, cueRows: cues.length, sourceLine: left.line };
  const body = Array.from({ length: Math.max(...columns.map(c => c.body.length)) }, (_, i) => ({
    spans: columns.flatMap(c => c.body[i] ? [c.body[i]] : []),
  }));
  const rows: PLine[] = [...cues, ...body].map(row => ({ ...row, dlg }));
  if (rows[0]) {
    // Whole-page speeches stay together. Longer speeches need a cue, retained
    // speech and room for MORE before they can begin on a page.
    rows[0].keepWithNext = rows.length <= LINES_PER_PAGE ? rows.length - 1 : minimumDialogueRows(dlg, 0, cues.length) - 1;
  }
  return rows;
}

export function layout(doc: ScreenplayDoc): PLine[] {
  const lines: PLine[] = [];
  let sceneLine: number | undefined;
  let pendingScene = false;
  let sceneStart = 0;
  const push = (row: PLine) => lines.push({ ...row, sceneLine });
  for (let i = 0; i < doc.elements.length; i++) {
    const el = doc.elements[i];
    if (el.kind === 'section') continue;
    if (el.kind === 'scene') sceneLine = el.line;
    if (el.kind === 'pagebreak') {
      push({ spans: [], forceBreak: true });
      pendingScene = false;
      continue;
    }
    if (lines.length) {
      push({ spans: [], keepWithNext: pendingScene ? 1 : undefined });
      if (el.kind === 'scene') push({ spans: [], keepWithNext: pendingScene ? 1 : undefined });
    }
    const source = `line ${el.line + 1}`;
    switch (el.kind) {
      case 'scene': {
        if (!pendingScene) sceneStart = lines.length;
        const text = el.text.toUpperCase();
        preflight(text, source);
        if (el.number) preflight(el.number, source);
        const headings = wrap(text, BODY_CHARS);
        const numbers = el.number ? wrap(el.number, SCENE_NUM_WIDTH) : [];
        for (let j = 0; j < Math.max(headings.length, numbers.length); j++) {
          const spans: Span[] = [];
          if (headings[j] !== undefined) spans.push({ x: M_LEFT, text: headings[j], font: 'Courier-Bold' });
          if (numbers[j] !== undefined) spans.push(
            { x: SCENE_NUM_LEFT_X, text: numbers[j], font: 'Courier-Bold' },
            { x: SCENE_NUM_RIGHT_X, text: numbers[j], font: 'Courier-Bold' });
          push({ spans, keepWithNext: 1 });
        }
        pendingScene = true;
        continue;
      }
      case 'dialogue': {
        const next = doc.elements[i + 1];
        const right = next?.kind === 'dialogue' && next.dual ? next : undefined;
        const rows = dialogueLines(el, right);
        if (pendingScene && lines.length - sceneStart + rows.length > LINES_PER_PAGE && rows[0]) {
          // A scene plus a page-sized dialogue cannot both remain whole. Keep
          // the scene with cue and speech; split the combined oversized group.
          const minimum = minimumDialogueRows(rows[0].dlg!, 0, rows[0].dlg!.cueRows);
          if (lines.length - sceneStart + minimum > LINES_PER_PAGE) {
            throw new Error(`Scene and dialogue at line ${el.line + 1} cannot fit on a PDF body page while retaining speech beside its cue.`);
          }
          rows[0].keepWithNext = minimum - 1;
        }
        rows.forEach(push);
        if (right) i++;
        break;
      }
      default: {
        const text = el.kind === 'transition' ? el.text.toUpperCase() : el.text;
        preflight(text, source);
        for (const row of wrap(text, BODY_CHARS)) {
          const x = el.kind === 'transition' ? PAGE_W - M_RIGHT - row.length * CHAR_W :
            el.kind === 'centered' ? M_LEFT + Math.floor((BODY_CHARS - row.length) / 2) * CHAR_W : M_LEFT;
          push({ spans: [{ x, text: row, font: el.kind === 'lyric' ? 'Courier-Oblique' : undefined }] });
        }
      }
    }
    pendingScene = false;
  }
  return lines;
}

/** Resolve keeps through spacing and cue groups, rather than only one row ahead. */
function keptRows(lines: PLine[], start: number): number {
  let end = start;
  for (let i = start; i <= end && i < lines.length; i++) {
    if (lines[i].forceBreak) return i - start;
    end = Math.min(lines.length - 1, Math.max(end, i + (lines[i].keepWithNext ?? 0)));
  }
  return end - start + 1;
}

export function paginate(lines: PLine[]): PLine[][] {
  const pages: PLine[][] = [];
  let cur: PLine[] = [];
  const flush = () => {
    // Spacing that falls into an unused page tail is not occupied screenplay.
    while (cur.length && cur[cur.length - 1].spans.length === 0) cur.pop();
    if (cur.length) pages.push(cur);
    cur = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.forceBreak) { flush(); continue; }
    if (!cur.length && !line.spans.length) continue;
    const needed = keptRows(lines, i);
    if (cur.length && cur.length + needed > LINES_PER_PAGE && needed <= LINES_PER_PAGE) flush();
    if (!cur.length && !line.spans.length) continue;
    if (line.dlg) {
      const group = line.dlg;
      let end = i + 1;
      while (end < lines.length && lines[end].dlg === group) end++;
      const original = lines.slice(i, end);
      const body = original.slice(group.cueRows);
      let offset = 0;
      let continued = false;
      do {
        const active = group.columns.filter(c => !continued || offset < c.body.length);
        const cues = continued ? cueRows(active, true).map(row => ({ ...row, sceneLine: line.sceneLine })) : original.slice(0, group.cueRows);
        const remaining = body.length - offset;
        const minimum = minimumDialogueRows(group, offset, cues.length);
        if (cur.length + minimum > LINES_PER_PAGE) flush();
        let capacity = LINES_PER_PAGE - cur.length - cues.length;
        const split = remaining > capacity;
        if (split) capacity--;
        let take = Math.min(remaining, capacity);
        while (take > 0 && !canSplitDialogue(group.columns, offset, offset + take)) take--;
        cur.push(...cues, ...body.slice(offset, offset + take));
        offset += take;
        if (offset < body.length) {
          const ongoing = group.columns.filter(c => offset < c.body.length);
          cur.push({ spans: ongoing.map(c => ({ x: c.cueX, text: '(MORE)' })), sceneLine: line.sceneLine });
          flush();
          continued = true;
        }
      } while (offset < body.length);
      i = end - 1;
    } else {
      if (cur.length === LINES_PER_PAGE) flush();
      if (cur.length || line.spans.length) cur.push(line);
    }
  }
  flush();
  return pages;
}

interface TitleLine { spans: Span[]; y: number }
function titleLayout(fm: Record<string, string>): TitleLine[] {
  if (!fm.title) return [];
  const rows: TitleLine[] = [];
  const field = (key: string, width: number): string[] => {
    const value = key === 'title' ? fm[key].toUpperCase() : fm[key];
    preflight(value, `title field "${key}"`);
    return wrap(value, width);
  };
  const place = (texts: string[], y: number, x: (text: string) => number, font?: Font) =>
    texts.forEach((text, i) => rows.push({ spans: [{ text, x: x(text), font }], y: y + i * LINE_H }));
  const center = (text: string) => M_LEFT + Math.floor((BODY_CHARS - text.length) / 2) * CHAR_W;
  const title = field('title', BODY_CHARS);
  if (title.length > 12) throw new Error('PDF title field "title" cannot fit its 12-row region.');
  place(title, 264, center, 'Courier-Bold');
  let y = 432;
  for (const key of ['credit', fm.author ? 'author' : 'authors']) {
    if (!fm[key]) continue;
    const texts = field(key, BODY_CHARS);
    if (y + texts.length * LINE_H > 576) throw new Error(`PDF title field "${key}" cannot fit the credit/author region.`);
    place(texts, y, center);
    y += (texts.length + 1) * LINE_H;
  }
  y = 624;
  for (const key of ['contact', 'copyright']) {
    if (!fm[key]) continue;
    const texts = field(key, 28);
    if (y + texts.length * LINE_H > 720) throw new Error(`PDF title field "${key}" cannot fit the footer region.`);
    place(texts, y, () => M_LEFT);
    y += texts.length * LINE_H;
  }
  const draftKey = ['draft', 'draft date', 'date'].find(key => fm[key]);
  if (draftKey) {
    const texts = field(draftKey, 28);
    if (texts.length > 8) throw new Error(`PDF title field "${draftKey}" cannot fit the footer region.`);
    place(texts, 624, text => PAGE_W - M_RIGHT - text.length * CHAR_W);
  }
  return rows;
}

export async function toPdf(doc: ScreenplayDoc): Promise<Buffer> {
  // Validate everything before constructing the stream; callers receive no bytes
  // until all layout and encoding checks have succeeded.
  const title = titleLayout(doc.frontmatter);
  const pages = paginate(layout(doc));
  if (!title.length && !pages.some(page => page.some(row => row.spans.some(span => span.text.trim())))) {
    throw new Error('PDF export has no printable content.');
  }
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'LETTER', autoFirstPage: false, margin: 0 });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    const render = (spans: Span[], y: number) => {
      for (const span of spans) pdf.font(span.font ?? 'Courier').fontSize(12).text(span.text, span.x, y, { lineBreak: false });
    };
    if (title.length) {
      pdf.addPage();
      title.forEach(row => render(row.spans, row.y));
    }
    pages.forEach((page, pageIdx) => {
      pdf.addPage();
      if (pageIdx > 0) {
        const num = `${pageIdx + 1}.`;
        render([{ x: PAGE_W - M_RIGHT - num.length * CHAR_W, text: num }], M_TOP - 2 * LINE_H);
      }
      page.forEach((line, i) => render(line.spans, M_TOP + i * LINE_H));
    });
    pdf.end();
  });
}

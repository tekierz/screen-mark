import PDFDocument from 'pdfkit';
import { Dialogue, ScreenplayDoc } from './ast';

// Industry screenplay metrics: US Letter, Courier 12pt (10 chars/inch, 6 lines/inch),
// 1.5" left margin, 1" top/right/bottom.
const CHAR_W = 7.2;
const LINE_H = 12;
const PAGE_W = 612;
const PAGE_H = 792;
const M_LEFT = 108;
const M_RIGHT = 72;
const M_TOP = 72;
const M_BOTTOM = 72;
const BODY_CHARS = 60; // (612 - 108 - 72) / 7.2

const LINES_PER_PAGE = Math.floor((PAGE_H - M_TOP - M_BOTTOM) / LINE_H); // 54

// Indents in chars from the left margin / wrap widths in chars.
const IND = {
  dialog: 10, //  2.5" from page edge
  paren: 16, //   3.1"
  character: 22, // 3.7"
};
const WIDTH = {
  action: BODY_CHARS,
  dialog: 35,
  paren: 30,
};
// Dual-dialog columns: two 28-char columns, right one starting 32 chars in.
const DUAL = { width: 28, rightOffset: 32, cueIndent: 6, parenIndent: 3 };

// Scene numbers sit outside the body: left at 1.0", right at 7.4" from page edge.
const SCENE_NUM_LEFT_X = 72;
const SCENE_NUM_RIGHT_X = 532.8;

type Font = 'Courier' | 'Courier-Bold' | 'Courier-Oblique';

interface Span {
  x: number;
  text: string;
  font?: Font;
}

interface DlgMeta {
  /** Groups the cue and body lines of one dialogue block. */
  id: number;
  character: string;
  cue?: boolean;
}

interface PLine {
  spans: Span[];
  /** Keep at least this many following lines on the same page. */
  keepWithNext?: number;
  forceBreak?: boolean;
  /** Set on single-column dialogue lines so pagination can split with (MORE)/(CONT'D). */
  dlg?: DlgMeta;
}

export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      let w = word;
      while (w.length > width) {
        // hard-split words longer than the column
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (line === '') line = w;
      else if (line.length + 1 + w.length <= width) line += ' ' + w;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

const blank = (): PLine => ({ spans: [] });

function dialogueLines(el: Dialogue, id: number): PLine[] {
  const dlg: DlgMeta = { id, character: el.character.toUpperCase() };
  const lines: PLine[] = [];
  lines.push({
    spans: [{ x: M_LEFT + IND.character * CHAR_W, text: dlg.character }],
    keepWithNext: el.parts.length > 0 ? 1 : undefined,
    dlg: { ...dlg, cue: true },
  });
  for (const part of el.parts) {
    if (part.type === 'parenthetical') {
      for (const l of wrap(`(${part.text})`, WIDTH.paren)) {
        lines.push({ spans: [{ x: M_LEFT + IND.paren * CHAR_W, text: l }], dlg });
      }
    } else {
      const font: Font | undefined = part.type === 'lyric' ? 'Courier-Oblique' : undefined;
      for (const l of wrap(part.text, WIDTH.dialog)) {
        lines.push({ spans: [{ x: M_LEFT + IND.dialog * CHAR_W, text: l, font }], dlg });
      }
    }
  }
  return lines;
}

/** Flatten one dialogue block into single-column rows for a dual layout. */
function dualColumnRows(el: Dialogue): { indent: number; text: string; font?: Font }[] {
  const rows: { indent: number; text: string; font?: Font }[] = [];
  rows.push({ indent: DUAL.cueIndent, text: el.character.toUpperCase() });
  for (const part of el.parts) {
    if (part.type === 'parenthetical') {
      for (const l of wrap(`(${part.text})`, DUAL.width - DUAL.parenIndent)) {
        rows.push({ indent: DUAL.parenIndent, text: l });
      }
    } else {
      const font: Font | undefined = part.type === 'lyric' ? 'Courier-Oblique' : undefined;
      for (const l of wrap(part.text, DUAL.width)) rows.push({ indent: 0, text: l, font });
    }
  }
  return rows;
}

function dualDialogueLines(left: Dialogue, right: Dialogue): PLine[] {
  const l = dualColumnRows(left);
  const r = dualColumnRows(right);
  const lines: PLine[] = [];
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const spans: Span[] = [];
    if (l[i]) spans.push({ x: M_LEFT + l[i].indent * CHAR_W, text: l[i].text, font: l[i].font });
    if (r[i]) {
      spans.push({
        x: M_LEFT + (DUAL.rightOffset + r[i].indent) * CHAR_W,
        text: r[i].text,
        font: r[i].font,
      });
    }
    lines.push({ spans });
  }
  // Dual blocks have no valid mid-split rendering (two columns would lose both
  // cues), so keep the whole block on one page. paginate ignores keeps larger
  // than a page, so an absurdly tall block still flows instead of vanishing.
  if (lines[0]) lines[0].keepWithNext = lines.length - 1 || undefined;
  return lines;
}

export function layout(doc: ScreenplayDoc): PLine[] {
  const lines: PLine[] = [];
  const push = (...ls: PLine[]) => lines.push(...ls);
  let dlgId = 0;

  for (let i = 0; i < doc.elements.length; i++) {
    const el = doc.elements[i];
    if (lines.length > 0 && el.kind !== 'pagebreak') {
      push(blank());
      if (el.kind === 'scene') push(blank());
    }
    switch (el.kind) {
      case 'scene': {
        const spans: Span[] = [{ x: M_LEFT, text: el.text.toUpperCase(), font: 'Courier-Bold' }];
        if (el.number) {
          spans.unshift({ x: SCENE_NUM_LEFT_X, text: el.number, font: 'Courier-Bold' });
          spans.push({ x: SCENE_NUM_RIGHT_X, text: el.number, font: 'Courier-Bold' });
        }
        push({ spans, keepWithNext: 2 });
        break;
      }
      case 'section':
        // Structural only — sections organize the outline, not the printed page.
        lines.pop(); // drop the spacing blank(s) we just added
        if (lines[lines.length - 1]?.spans.length === 0) lines.pop();
        break;
      case 'action':
        for (const l of wrap(el.text, WIDTH.action)) push({ spans: [{ x: M_LEFT, text: l }] });
        break;
      case 'dialogue': {
        const next = doc.elements[i + 1];
        if (next?.kind === 'dialogue' && next.dual) {
          push(...dualDialogueLines(el, next)); // dual blocks never split with (MORE)
          i++;
        } else {
          push(...dialogueLines(el, dlgId++));
        }
        break;
      }
      case 'transition': {
        const text = el.text.toUpperCase();
        push({ spans: [{ x: Math.max(M_LEFT, PAGE_W - M_RIGHT - text.length * CHAR_W), text }] });
        break;
      }
      case 'centered': {
        const x = M_LEFT + Math.max(0, Math.floor((BODY_CHARS - el.text.length) / 2)) * CHAR_W;
        push({ spans: [{ x, text: el.text }] });
        break;
      }
      case 'lyric':
        for (const l of wrap(el.text, WIDTH.action)) {
          push({ spans: [{ x: M_LEFT, text: l, font: 'Courier-Oblique' }] });
        }
        break;
      case 'pagebreak':
        push({ spans: [], forceBreak: true });
        break;
    }
  }
  return lines;
}

export function paginate(lines: PLine[]): PLine[][] {
  const pages: PLine[][] = [];
  let cur: PLine[] = [];
  const flush = () => {
    if (cur.length > 0) {
      pages.push(cur);
      cur = [];
    }
  };
  const atCharIndent = (text: string): Span[] => [{ x: M_LEFT + IND.character * CHAR_W, text }];

  for (const line of lines) {
    if (line.forceBreak) {
      flush();
      continue;
    }
    if (cur.length === 0 && line.spans.length === 0) continue; // no leading blanks
    const needed = 1 + (line.keepWithNext ?? 0);
    if (cur.length + needed > LINES_PER_PAGE && needed <= LINES_PER_PAGE) {
      const prev = cur[cur.length - 1];
      if (line.dlg && !line.dlg.cue && prev?.dlg?.id === line.dlg.id) {
        // Splitting inside a dialogue block: (MORE) at the bottom, NAME (CONT'D) on top of the next page.
        const moved: PLine[] = [];
        while (cur.length + 1 > LINES_PER_PAGE) moved.unshift(cur.pop()!); // make room for (MORE)
        const newLast = cur[cur.length - 1];
        if (newLast?.dlg?.cue && newLast.dlg.id === line.dlg.id) {
          moved.unshift(cur.pop()!); // only the cue would remain — move the whole block start instead
        } else {
          cur.push({ spans: atCharIndent('(MORE)') });
        }
        flush();
        if (!moved[0]?.dlg?.cue) {
          cur.push({ spans: atCharIndent(`${line.dlg.character} (CONT'D)`), dlg: { ...line.dlg, cue: true } });
        }
        cur.push(...moved, line);
        continue;
      }
      flush();
    }
    cur.push(line);
  }
  flush();
  return pages;
}

function renderTitlePage(pdf: PDFKit.PDFDocument, fm: Record<string, string>): void {
  pdf.addPage();
  const centered = (text: string, y: number, font: Font = 'Courier') => {
    const x = (PAGE_W - text.length * CHAR_W) / 2;
    pdf.font(font).fontSize(12).text(text, Math.max(M_LEFT, x), y, { lineBreak: false });
  };
  let y = PAGE_H / 3;
  centered(fm.title.toUpperCase(), y, 'Courier-Bold');
  y += 3 * LINE_H;
  if (fm.credit) {
    centered(fm.credit, y);
    y += 2 * LINE_H;
  }
  const author = fm.author ?? fm.authors;
  if (author) centered(author, y);

  let bottomY = PAGE_H - M_BOTTOM - 4 * LINE_H;
  for (const key of ['contact', 'copyright']) {
    if (fm[key]) {
      pdf.font('Courier').fontSize(12).text(fm[key], M_LEFT, bottomY, { lineBreak: false });
      bottomY += LINE_H;
    }
  }
  const draft = fm.draft ?? fm['draft date'] ?? fm.date;
  if (draft) {
    const x = Math.max(M_LEFT, PAGE_W - M_RIGHT - draft.length * CHAR_W);
    pdf.font('Courier').fontSize(12).text(draft, x, PAGE_H - M_BOTTOM - 4 * LINE_H, { lineBreak: false });
  }
}

export function toPdf(doc: ScreenplayDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'LETTER', autoFirstPage: false, margin: 0 });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    if (doc.frontmatter.title) renderTitlePage(pdf, doc.frontmatter);

    const pages = paginate(layout(doc));
    pages.forEach((page, pageIdx) => {
      pdf.addPage();
      if (pageIdx > 0) {
        const num = `${pageIdx + 1}.`;
        pdf
          .font('Courier')
          .fontSize(12)
          .text(num, PAGE_W - M_RIGHT - num.length * CHAR_W, M_TOP - 2 * LINE_H, { lineBreak: false });
      }
      let y = M_TOP;
      for (const line of page) {
        for (const span of line.spans) {
          pdf.font(span.font ?? 'Courier').fontSize(12).text(span.text, span.x, y, { lineBreak: false });
        }
        y += LINE_H;
      }
    });

    pdf.end();
  });
}

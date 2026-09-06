import { ScreenplayDoc } from './ast';

const TITLE_KEYS: Record<string, string> = {
  title: 'Title', credit: 'Credit', author: 'Author', authors: 'Authors', source: 'Source',
  draft: 'Draft date', 'draft date': 'Draft date', date: 'Date', contact: 'Contact',
  copyright: 'Copyright', notes: 'Notes',
};
const SLUG_PREFIX_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ].+/i;

function fail(source: string, reason: string): never {
  throw new Error(`Fountain export cannot preserve ${reason} at ${source}.`);
}

function checkLiteralNotes(text: string, source: string): void {
  // Fountain has no portable escape for note brackets. Escaping '[' is itself
  // visible in the independent importer, so silently exporting would lose text.
  if (/\[\[[\s\S]*?\]\]/.test(text)) fail(source, 'literal [[note]] delimiters');
}

/** ScreenMark text is literal: escape Fountain emphasis and boneyard delimiters. */
function literal(text: string, source: string): string {
  checkLiteralNotes(text, source);
  return text.replace(/[\\*_#]/g, '\\$&');
}

export function toFountain(doc: ScreenplayDoc): string {
  const out: string[] = [];
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    const fountainKey = Object.hasOwn(TITLE_KEYS, key) ? TITLE_KEYS[key] : undefined;
    if (!fountainKey) fail(`title field "${key}"`, 'an unsupported title key');
    if (keys.has(fountainKey)) fail(`title field "${key}"`, 'duplicate title fields');
    keys.add(fountainKey);
    if (!value.trim()) fail(`title field "${key}"`, 'an empty title value');
    const text = literal(value, `title field "${key}"`);
    out.push(text.includes('\n') ? `${fountainKey}:\n    ${text.replace(/\n/g, '\n    ')}` : `${fountainKey}: ${text}`);
  }
  if (out.length) out.push('');

  for (let i = 0; i < doc.elements.length; i++) {
    const el = doc.elements[i];
    const source = `line ${el.line + 1}`;
    switch (el.kind) {
      case 'section':
        out.push('#'.repeat(el.depth) + ' ' + literal(el.text, source), '');
        break;
      case 'scene': {
        if (el.number && !/^[A-Za-z0-9.-]+$/.test(el.number)) fail(source, 'a scene identifier outside letters, digits, periods and hyphens');
        if (!el.text || el.text.startsWith('.')) fail(source, 'a scene heading starting with a literal period or containing no text');
        const slug = literal(el.text.toUpperCase(), source);
        out.push((SLUG_PREFIX_RE.test(slug) ? slug : '.' + slug) + (el.number ? ` #${el.number}#` : ''), '');
        break;
      }
      case 'action':
        // Force the paragraph, leaving interior line breaks and literal leading
        // punctuation intact. A second ! is visible text after the forcing !.
        out.push('!' + literal(el.text, source), '');
        break;
      case 'dialogue': {
        // Importers resolve notes after merging adjacent speech or lyric parts;
        // a parenthetical starts its own token and ends the preceding run.
        let run = '';
        let runType: string | undefined;
        for (const part of el.parts) {
          if (part.type !== runType || part.type === 'parenthetical') {
            checkLiteralNotes(run, source);
            run = '';
          }
          run += '\n' + part.text;
          runType = part.type;
        }
        checkLiteralNotes(run, source);
        if (!/^[^()\n^]+(?:\(.*\))?$/.test(el.character)) fail(source, 'a character cue with literal carets or misplaced parentheses');
        if (!el.parts.some(part => part.text.trim())) fail(source, 'a character cue without dialogue');
        if (el.dual && (doc.elements[i - 1]?.kind !== 'dialogue' || (doc.elements[i - 1] as { dual?: boolean }).dual)) {
          fail(source, 'dual dialogue without a preceding single dialogue');
        }
        out.push('@' + literal(el.character, source) + (el.dual ? ' ^' : ''));
        for (const part of el.parts) {
          const text = literal(part.text, `dialogue beginning at ${source}`);
          if (part.type === 'parenthetical') {
            if (!part.text.trim()) fail(source, 'an empty parenthetical');
            out.push(`(${text})`);
          } else if (part.type === 'lyric') {
            if (!part.text.trim()) fail(source, 'an empty lyric');
            out.push(text.split('\n').map(line => '~' + line).join('\n'));
          } else {
            // A speech line resembling a parenthetical has no faithful escape
            // in Fountain; backslash-parenthesis would add a visible backslash.
            if (part.text.split('\n').some(line => /^\(.+\)$/.test(line.trim()))) fail(source, 'literal parenthetical-shaped speech');
            out.push(text === '' ? '  ' : text.replace(/^~/gm, '\\~'));
          }
        }
        out.push('');
        break;
      }
      case 'transition': {
        if (el.text.endsWith('<')) fail(source, 'a transition ending in a literal less-than sign');
        let text = literal(el.text.toUpperCase(), source);
        if (/ TO:$/.test(text)) {
          // Natural transition recognition precedes forcing in some importers:
          // adding > to CUT TO: would leave a visible >. Prevent an earlier
          // scene match by escaping its identifying punctuation when available.
          if (text.startsWith('.')) text = '\\' + text;
          else if (SLUG_PREFIX_RE.test(text)) {
            const separator = text.search(/[./ ]/);
            if (text[separator] === ' ') fail(source, 'a transition that also matches a scene heading');
            text = text.slice(0, separator) + '\\' + text.slice(separator);
          }
          out.push(text, '');
        } else {
          out.push((text === 'TO:' ? '>' : '> ') + text, '');
        }
        break;
      }
      case 'centered':
        if (/[<>]/.test(el.text)) fail(source, 'literal angle brackets inside centered text');
        out.push(`> ${literal(el.text, source)} <`, '');
        break;
      case 'lyric':
        if (!el.text.trim()) fail(source, 'an empty lyric');
        out.push(literal(el.text, source).split('\n').map(line => '~' + line).join('\n'), '');
        break;
      case 'pagebreak':
        out.push('===', '');
        break;
    }
  }
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

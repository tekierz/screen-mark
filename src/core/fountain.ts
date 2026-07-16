import { ScreenplayDoc } from './ast';

const TITLE_KEYS: Record<string, string> = {
  title: 'Title',
  credit: 'Credit',
  author: 'Author',
  authors: 'Authors',
  source: 'Source',
  draft: 'Draft date',
  'draft date': 'Draft date',
  date: 'Date',
  contact: 'Contact',
  copyright: 'Copyright',
  notes: 'Notes',
};

const SLUG_PREFIX_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
const ALL_CAPS_RE = /^[^a-z]*$/;

export function toFountain(doc: ScreenplayDoc): string {
  const out: string[] = [];

  const titleEntries = Object.entries(doc.frontmatter);
  if (titleEntries.length > 0) {
    for (const [key, value] of titleEntries) {
      const fountainKey = TITLE_KEYS[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
      out.push(`${fountainKey}: ${value}`);
    }
    out.push('');
  }

  for (let i = 0; i < doc.elements.length; i++) {
    const el = doc.elements[i];
    switch (el.kind) {
      case 'section':
        out.push('#'.repeat(el.depth) + ' ' + el.text, '');
        break;
      case 'scene': {
        const slug = el.text.toUpperCase();
        const forced = SLUG_PREFIX_RE.test(slug) ? slug : '.' + slug;
        out.push(forced + (el.number ? ` #${el.number}#` : ''), '');
        break;
      }
      case 'action': {
        // Guard only the first line against being misread as a cue/transition —
        // interior lines can't be (no preceding blank), and Fountain prints a
        // mid-paragraph '!' verbatim.
        const lines = el.text.split('\n');
        if (ALL_CAPS_RE.test(lines[0]) && /[A-Z]/.test(lines[0])) lines[0] = '!' + lines[0];
        out.push(lines.join('\n'), '');
        break;
      }
      case 'dialogue': {
        const nameOnly = el.character.replace(/\(.*\)/g, '').trim();
        const cue = ALL_CAPS_RE.test(nameOnly) ? el.character : '@' + el.character;
        out.push(cue + (el.dual ? ' ^' : ''));
        for (const part of el.parts) {
          if (part.type === 'parenthetical') out.push(`(${part.text})`);
          else if (part.type === 'lyric') out.push('~' + part.text);
          else out.push(part.text === '' ? '  ' : part.text);
        }
        out.push('');
        break;
      }
      case 'transition': {
        const text = el.text.toUpperCase();
        out.push(/TO:$/.test(text) && ALL_CAPS_RE.test(el.text) ? text : '> ' + text, '');
        break;
      }
      case 'centered':
        out.push(`> ${el.text} <`, '');
        break;
      case 'lyric':
        out.push('~' + el.text, '');
        break;
      case 'pagebreak':
        out.push('===', '');
        break;
    }
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

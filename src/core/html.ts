import { Dialogue, ScreenplayDoc } from './ast';

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const SCREENPLAY_CSS = `
  .screenplay {
    font-family: 'Courier Prime', 'Courier New', Courier, monospace;
    font-size: 12pt;
    line-height: 1;
    max-width: 62ch;
    margin: 0 auto;
    padding: 2em 1em;
  }
  .screenplay > * { margin: 1em 0; white-space: pre-wrap; }
  .sm-scene { font-weight: bold; text-transform: uppercase; margin-top: 2em; position: relative; }
  .sm-scene .sm-scene-num { position: absolute; left: -5ch; }
  .sm-scene .sm-scene-num-r { position: absolute; right: -5ch; }
  .sm-action { max-width: 60ch; }
  .sm-dialogue { margin: 1em 0; }
  .sm-character { margin-left: 22ch; text-transform: uppercase; }
  .sm-paren { margin-left: 16ch; max-width: 30ch; }
  .sm-line { margin-left: 10ch; max-width: 35ch; }
  .sm-lyric { font-style: italic; }
  .sm-transition { text-align: right; text-transform: uppercase; }
  .sm-centered { text-align: center; }
  .sm-dual { display: flex; gap: 4ch; }
  .sm-dual .sm-dialogue { flex: 1; margin: 0; }
  .sm-dual .sm-character { margin-left: 6ch; }
  .sm-dual .sm-paren { margin-left: 3ch; max-width: 25ch; }
  .sm-dual .sm-line { margin-left: 0; max-width: 28ch; }
  .sm-pagebreak { border: 0; border-top: 1px dashed currentColor; opacity: 0.4; }
  .sm-title-page { text-align: center; margin-bottom: 6em; }
  .sm-title { font-weight: bold; text-transform: uppercase; margin-bottom: 2em; }
`;

function dialogueHtml(el: Dialogue, withLine = true): string {
  const parts = el.parts
    .map((p) => {
      if (p.type === 'parenthetical') return `<div class="sm-paren">(${esc(p.text)})</div>`;
      const lyric = p.type === 'lyric' ? ' sm-lyric' : '';
      return `<div class="sm-line${lyric}">${esc(p.text)}</div>`;
    })
    .join('');
  const attr = withLine ? ` data-line="${el.line}"` : '';
  return `<div class="sm-dialogue"${attr}><div class="sm-character">${esc(el.character)}</div>${parts}</div>`;
}

export function toHtml(doc: ScreenplayDoc): string {
  const out: string[] = ['<div class="screenplay">'];

  const fm = doc.frontmatter;
  if (fm.title) {
    out.push('<div class="sm-title-page">');
    out.push(`<div class="sm-title">${esc(fm.title)}</div>`);
    if (fm.credit) out.push(`<div>${esc(fm.credit)}</div>`);
    const author = fm.author ?? fm.authors;
    if (author) out.push(`<div>${esc(author)}</div>`);
    out.push('</div>');
  }

  for (let i = 0; i < doc.elements.length; i++) {
    const el = doc.elements[i];
    switch (el.kind) {
      case 'section':
        break; // structural only
      case 'scene': {
        const num = el.number
          ? `<span class="sm-scene-num">${esc(el.number)}</span><span class="sm-scene-num-r">${esc(el.number)}</span>`
          : '';
        out.push(`<div class="sm-scene" data-line="${el.line}">${num}${esc(el.text)}</div>`);
        break;
      }
      case 'action':
        out.push(`<div class="sm-action" data-line="${el.line}">${esc(el.text)}</div>`);
        break;
      case 'dialogue': {
        const next = doc.elements[i + 1];
        if (next?.kind === 'dialogue' && next.dual) {
          out.push(`<div class="sm-dual" data-line="${el.line}">${dialogueHtml(el, false)}${dialogueHtml(next, false)}</div>`);
          i++;
        } else {
          out.push(dialogueHtml(el));
        }
        break;
      }
      case 'transition':
        out.push(`<div class="sm-transition" data-line="${el.line}">${esc(el.text)}</div>`);
        break;
      case 'centered':
        out.push(`<div class="sm-centered" data-line="${el.line}">${esc(el.text)}</div>`);
        break;
      case 'lyric':
        out.push(`<div class="sm-action sm-lyric" data-line="${el.line}">${esc(el.text)}</div>`);
        break;
      case 'pagebreak':
        out.push(`<hr class="sm-pagebreak" data-line="${el.line}">`);
        break;
    }
  }
  out.push('</div>');
  return out.join('\n');
}

import { Action, Dialogue, Element, Frontmatter, ScreenplayDoc } from './ast';

export const SCENE_RE = /^##\s+(.*?)(?:\s+#([^#\s][^#]*?)#)?\s*$/;
export const SECTION_RE = /^(#{1,6})\s+(.*)$/;
export const CHARACTER_RE = /^\*\*([^*]+)\*\*\s*(\^)?$/;
export const PARENTHETICAL_RE = /^_\((.*)\)_$/;
export const CENTERED_RE = /^>\s?(.*?)\s?<$/;
export const DIALOG_RE = /^>\s?(.*)$/;
export const LYRIC_RE = /^~\s?(.*)$/;
export const TRANSITION_RE = /^@\s?(.*)$/;
export const PAGEBREAK_RE = /^-{3,}$/;

/** Blank out `<!-- ... -->` notes while preserving line numbers. */
export function stripNotes(text: string): string {
  return text.replace(/<!--[\s\S]*?(-->|$)/g, (m) => m.replace(/[^\n]/g, ''));
}

export function parse(text: string): ScreenplayDoc {
  const lines = stripNotes(text).split(/\r?\n/);
  const frontmatter: Frontmatter = {};
  const elements: Element[] = [];

  let i = 0;
  if (lines[0]?.trim() === '---') {
    let end = -1;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === '---') {
        end = j;
        break;
      }
    }
    if (end > 0) {
      for (let j = 1; j < end; j++) {
        const m = lines[j].match(/^\s*([A-Za-z][\w ]*?)\s*:\s*(.*)$/);
        if (m) frontmatter[m[1].toLowerCase()] = m[2].trim();
      }
      i = end + 1;
    }
  }

  let dialogue: Dialogue | null = null;
  let action: { lines: string[]; line: number } | null = null;

  const flushAction = () => {
    if (action) {
      elements.push({ kind: 'action', text: action.lines.join('\n'), line: action.line } as Action);
      action = null;
    }
  };
  const appendAction = (text: string, line: number) => {
    dialogue = null;
    if (action) action.lines.push(text);
    else action = { lines: [text], line };
  };

  for (; i < lines.length; i++) {
    const t = lines[i].trim();

    if (t === '') {
      dialogue = null;
      flushAction();
      continue;
    }

    let m: RegExpMatchArray | null;

    if (PAGEBREAK_RE.test(t)) {
      dialogue = null;
      flushAction();
      elements.push({ kind: 'pagebreak', line: i });
    } else if ((m = t.match(SCENE_RE))) {
      dialogue = null;
      flushAction();
      elements.push({ kind: 'scene', text: m[1].trim(), number: m[2], line: i });
    } else if ((m = t.match(SECTION_RE))) {
      dialogue = null;
      flushAction();
      elements.push({ kind: 'section', text: m[2].trim(), depth: m[1].length, line: i });
    } else if ((m = t.match(CHARACTER_RE))) {
      flushAction();
      dialogue = { kind: 'dialogue', character: m[1].trim(), dual: m[2] === '^', parts: [], line: i };
      elements.push(dialogue);
    } else if ((m = t.match(CENTERED_RE))) {
      dialogue = null;
      flushAction();
      elements.push({ kind: 'centered', text: m[1], line: i });
    } else if ((m = t.match(DIALOG_RE))) {
      if (dialogue) dialogue.parts.push({ type: 'line', text: m[1] });
      else appendAction(t, i); // orphan blockquote: fall back to action, keep raw
    } else if ((m = t.match(PARENTHETICAL_RE))) {
      if (dialogue) dialogue.parts.push({ type: 'parenthetical', text: m[1].trim() });
      else appendAction(t, i);
    } else if ((m = t.match(LYRIC_RE))) {
      if (dialogue) dialogue.parts.push({ type: 'lyric', text: m[1] });
      else {
        flushAction();
        elements.push({ kind: 'lyric', text: m[1], line: i });
      }
    } else if ((m = t.match(TRANSITION_RE))) {
      dialogue = null;
      flushAction();
      elements.push({ kind: 'transition', text: m[1].trim(), line: i });
    } else {
      appendAction(t, i);
    }
  }
  flushAction();

  return { frontmatter, elements };
}

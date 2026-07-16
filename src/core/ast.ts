export type Frontmatter = Record<string, string>;

export type DialoguePart =
  | { type: 'parenthetical'; text: string }
  | { type: 'line'; text: string }
  | { type: 'lyric'; text: string };

export interface SceneHeading {
  kind: 'scene';
  text: string;
  /** Stable scene ID from a trailing `#4A#`, e.g. "4A". */
  number?: string;
  line: number;
}

export interface Section {
  kind: 'section';
  text: string;
  /** Number of leading `#` (2 is reserved for scene headings). */
  depth: number;
  line: number;
}

export interface Action {
  kind: 'action';
  text: string;
  line: number;
}

export interface Dialogue {
  kind: 'dialogue';
  /** Full cue as written, e.g. "MAYA (V.O.)". */
  character: string;
  /** True when the cue ended with `^` — render side by side with the previous dialogue. */
  dual: boolean;
  parts: DialoguePart[];
  line: number;
}

export interface Transition {
  kind: 'transition';
  text: string;
  line: number;
}

export interface Centered {
  kind: 'centered';
  text: string;
  line: number;
}

export interface Lyric {
  kind: 'lyric';
  text: string;
  line: number;
}

export interface PageBreak {
  kind: 'pagebreak';
  line: number;
}

export type Element =
  | SceneHeading
  | Section
  | Action
  | Dialogue
  | Transition
  | Centered
  | Lyric
  | PageBreak;

export interface ScreenplayDoc {
  frontmatter: Frontmatter;
  elements: Element[];
}

import { SceneHeading } from './ast';
import { parse } from './parser';
import { layout, paginate, LINES_PER_PAGE } from './pdf';
import { escapeMarkdownCell } from './markdown';

export interface SceneBreakdown {
  /** Stable scene ID from `#4A#`, if assigned. */
  number?: string;
  slug: string;
  intExt: 'INT' | 'EXT' | 'INT/EXT' | 'OTHER';
  location: string;
  timeOfDay: string;
  characters: string[];
  /** Conservative retained-row estimate, rounded up per scene to eighths, minimum 1. */
  eighths: number;
  /** Production elements tagged in notes, e.g. { prop: ['revolver'], vfx: [...] }. */
  tags: Record<string, string[]>;
  line: number;
}

export interface Breakdown {
  scenes: SceneBreakdown[];
  characters: string[];
  locations: string[];
  totalEighths: number;
}

const SLUG_RE = /^(INT\.?\/EXT\.?|I\/E|INT|EXT|EST)[.\s]+(.*)$/i;
const LINES_PER_EIGHTH = LINES_PER_PAGE / 8;

export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (whole && rem) return `${whole} ${rem}/8`;
  if (whole) return `${whole}`;
  return `${rem}/8`;
}

function parseSlug(text: string): Pick<SceneBreakdown, 'intExt' | 'location' | 'timeOfDay'> {
  const m = text.match(SLUG_RE);
  if (!m) return { intExt: 'OTHER', location: text.toUpperCase(), timeOfDay: '' };
  const prefix = m[1].toUpperCase();
  const intExt = prefix.includes('/') ? 'INT/EXT' : prefix === 'EST' ? 'EXT' : (prefix as 'INT' | 'EXT');
  const segs = m[2].split(/\s+-\s+/);
  if (segs.length > 1) {
    return {
      intExt,
      location: segs.slice(0, -1).join(' - ').toUpperCase().trim(),
      timeOfDay: segs[segs.length - 1].toUpperCase().trim(),
    };
  }
  return { intExt, location: m[2].toUpperCase().trim(), timeOfDay: '' };
}

/** Attach `@category: item, item` tags found in <!-- --> notes to the scene containing them. */
function collectTags(text: string, scenes: SceneBreakdown[]): void {
  const noteRe = /<!--([\s\S]*?)(?:-->|$)/g; // unclosed note runs to EOF, matching stripNotes
  let note: RegExpExecArray | null;
  while ((note = noteRe.exec(text))) {
    const line = text.slice(0, note.index).split('\n').length - 1;
    const scene = [...scenes].reverse().find((s) => s.line <= line);
    if (!scene) continue;
    const tagRe = /@([A-Za-z][\w-]*)\s*:\s*([^@]+)/g;
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(note[1]))) {
      const category = tag[1].toLowerCase();
      const items = tag[2]
        .split(',')
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (items.length) {
        if (!Object.prototype.hasOwnProperty.call(scene.tags, category)) scene.tags[category] = [];
        scene.tags[category].push(...items);
      }
    }
  }
}

export function buildBreakdown(text: string): Breakdown {
  const doc = parse(text);
  const els = doc.elements;
  const sceneIdxs = els.flatMap((e, i) => (e.kind === 'scene' ? [i] : []));
  const scenes: SceneBreakdown[] = [];
  const occupiedRows = new Map<number, number>();
  for (const row of paginate(layout(doc)).flat()) {
    if (row.sceneLine !== undefined) {
      occupiedRows.set(row.sceneLine, (occupiedRows.get(row.sceneLine) ?? 0) + 1);
    }
  }

  for (let s = 0; s < sceneIdxs.length; s++) {
    const start = sceneIdxs[s];
    const end = s + 1 < sceneIdxs.length ? sceneIdxs[s + 1] : els.length;
    const heading = els[start] as SceneHeading;
    const slice = els.slice(start, end);

    const characters: string[] = [];
    for (const el of slice) {
      if (el.kind !== 'dialogue') continue;
      const name = el.character.replace(/\s*\(.*\)\s*$/, '').toUpperCase();
      if (name && !characters.includes(name)) characters.push(name);
    }

    // Count retained rows from the complete pagination, excluding unused page tails.
    const lineCount = occupiedRows.get(heading.line) ?? 0;

    scenes.push({
      number: heading.number,
      slug: heading.text.toUpperCase(),
      ...parseSlug(heading.text),
      characters,
      eighths: Math.max(1, Math.ceil(lineCount / LINES_PER_EIGHTH)),
      tags: {},
      line: heading.line,
    });
  }

  collectTags(text, scenes);

  const characters = [...new Set(scenes.flatMap((s) => s.characters))];
  const locations = [...new Set(scenes.map((s) => s.location))];
  return {
    scenes,
    characters,
    locations,
    totalEighths: scenes.reduce((sum, s) => sum + s.eighths, 0),
  };
}

function csvField(value: string): string {
  // Leading apostrophe defuses spreadsheet formula injection (=, +, -, @ starters).
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const flatTags = (tags: Record<string, string[]>): string =>
  Object.entries(tags)
    .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
    .join('; ');

export function breakdownToMarkdown(bd: Breakdown, title: string): string {
  const out: string[] = [
    `# Scene Breakdown — ${title}`,
    '',
    `Total: ${bd.scenes.length} scenes, ${formatEighths(bd.totalEighths)} estimated pgs`,
    '',
    'Scene estimates round retained PDF body rows up to eighths per scene; their sum may exceed the physical PDF page count. Speaking cast includes dialogue cues only; silent performers are not inferred.',
    '',
    '| # | Slug | I/E | Location | Time | Estimated pages | Speaking cast | Elements |',
    '|---|------|-----|----------|------|-------|------|----------|',
  ];
  for (const s of bd.scenes) {
    out.push(
      `| ${[s.number ?? '', s.slug, s.intExt, s.location, s.timeOfDay, formatEighths(s.eighths), s.characters.join(', '), flatTags(s.tags)].map(escapeMarkdownCell).join(' | ')} |`
    );
  }

  out.push('', '## Speaking cast', '');
  for (const name of bd.characters) {
    const appears = bd.scenes.filter((s) => s.characters.includes(name));
    const nums = appears.map((s) => s.number ?? `@${s.line + 1}`).join(', ');
    out.push(`- **${name}** — ${appears.length} scene${appears.length === 1 ? '' : 's'} (${nums})`);
  }

  out.push('', '## Locations', '');
  for (const loc of bd.locations) {
    const at = bd.scenes.filter((s) => s.location === loc);
    const eighths = at.reduce((sum, s) => sum + s.eighths, 0);
    out.push(`- **${loc}** — ${at.length} scene${at.length === 1 ? '' : 's'}, ${formatEighths(eighths)} pgs`);
  }

  return out.join('\n') + '\n';
}

export function breakdownToCsv(bd: Breakdown): string {
  const rows = [['Scene', 'Slug', 'IntExt', 'Location', 'Time', 'Eighths', 'Cast', 'Elements']];
  for (const s of bd.scenes) {
    rows.push([
      s.number ?? '',
      s.slug,
      s.intExt,
      s.location,
      s.timeOfDay,
      String(s.eighths),
      s.characters.join(', '),
      flatTags(s.tags),
    ]);
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}

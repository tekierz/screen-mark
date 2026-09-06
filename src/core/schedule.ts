import { escapeMarkdownCell } from './markdown';
import { Breakdown, SceneBreakdown, formatEighths } from './breakdown';

export interface ShootDay {
  scenes: SceneBreakdown[];
  eighths: number;
}

const NIGHTISH = ['NIGHT', 'DUSK', 'EVENING', 'MIDNIGHT'];

/**
 * Strip-board ordering: group scenes by location (in order of first appearance,
 * minimizing company moves), day work before night work within each location,
 * then pack greedily into days of `pagesPerDay` pages.
 */
export function buildSchedule(bd: Breakdown, pagesPerDay = 5): ShootDay[] {
  const strips: SceneBreakdown[] = [];
  for (const loc of bd.locations) {
    const group = bd.scenes.filter((s) => s.location === loc);
    const day = group.filter((s) => !NIGHTISH.includes(s.timeOfDay));
    const night = group.filter((s) => NIGHTISH.includes(s.timeOfDay));
    strips.push(...day, ...night);
  }

  const capacity = Math.max(1, Math.round(pagesPerDay * 8));
  const days: ShootDay[] = [];
  let cur: ShootDay = { scenes: [], eighths: 0 };
  for (const s of strips) {
    if (cur.scenes.length > 0 && cur.eighths + s.eighths > capacity) {
      days.push(cur);
      cur = { scenes: [], eighths: 0 };
    }
    cur.scenes.push(s);
    cur.eighths += s.eighths;
  }
  if (cur.scenes.length > 0) days.push(cur);
  return days;
}

export function scheduleToMarkdown(days: ShootDay[], title: string, pagesPerDay: number): string {
  const out: string[] = [
    `# Shooting Schedule — ${title}`,
    '',
    `${days.reduce((n, d) => n + d.scenes.length, 0)} scenes over ${days.length} day${days.length === 1 ? '' : 's'} (target ${pagesPerDay} pages/day). Scenes grouped by location, day work before night.`,
    '',
    'Estimates round retained PDF body rows up to eighths per scene; their sum may exceed the physical PDF page count. Speaking cast includes dialogue cues only; silent performers are not inferred. Location and exact day/night ordering is a draft scheduling heuristic.',
  ];
  days.forEach((day, i) => {
    out.push('', `## Day ${i + 1} — ${formatEighths(day.eighths)} pgs`, '');
    out.push('| # | Slug | I/E | Time | Estimated pages | Speaking cast | Elements |');
    out.push('|---|------|-----|------|-------|------|----------|');
    for (const s of day.scenes) {
      const tags = Object.entries(s.tags)
        .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
        .join('; ');
      out.push(
        `| ${[s.number ?? '', s.slug, s.intExt, s.timeOfDay, formatEighths(s.eighths), s.characters.join(', '), tags].map(escapeMarkdownCell).join(' | ')} |`
      );
    }
  });
  return out.join('\n') + '\n';
}

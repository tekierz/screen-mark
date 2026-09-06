import { readFile, writeFile } from 'node:fs/promises';
import { parse } from '../src/core/parser';
import { toPdf } from '../src/core/pdf';
import { toFountain } from '../src/core/fountain';
import { buildBreakdown, breakdownToMarkdown, breakdownToCsv } from '../src/core/breakdown';
import { buildSchedule, scheduleToMarkdown } from '../src/core/schedule';

const stem = 'samples/coffee';
const source = await readFile(`${stem}.screen.md`, 'utf8');
const doc = parse(source);
const title = doc.frontmatter.title ?? 'Cold Brew';
const breakdown = buildBreakdown(source);
await writeFile(`${stem}.pdf`, await toPdf(doc));
await writeFile(`${stem}.fountain`, toFountain(doc));
await writeFile(`${stem}.breakdown.md`, breakdownToMarkdown(breakdown, title));
await writeFile(`${stem}.breakdown.csv`, breakdownToCsv(breakdown));
await writeFile(`${stem}.schedule.md`, scheduleToMarkdown(buildSchedule(breakdown), title, 5));
console.log(`Regenerated ${stem} PDF, Fountain, breakdown and schedule`);

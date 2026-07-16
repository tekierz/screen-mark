import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBreakdown, breakdownToCsv, breakdownToMarkdown, formatEighths } from '../src/core/breakdown';
import { buildSchedule, scheduleToMarkdown } from '../src/core/schedule';

const SCRIPT = `---
title: Test
---

## INT. COFFEE SHOP - DAY #1#

<!-- @prop: espresso machine, rag @sound: hiss -->

Maya wipes the counter.

**MAYA (V.O.)**
> He's late.

**JONAS**
> Traffic.

## EXT. STREET - NIGHT #2#

Jonas bikes away.

**JONAS**
> Onward!

## INT. COFFEE SHOP - LATER #3#

Maya closes up.
`;

test('breakdown extracts slug parts, cast, numbers, tags', () => {
  const bd = buildBreakdown(SCRIPT);
  assert.equal(bd.scenes.length, 3);

  const [s1, s2, s3] = bd.scenes;
  assert.equal(s1.number, '1');
  assert.equal(s1.intExt, 'INT');
  assert.equal(s1.location, 'COFFEE SHOP');
  assert.equal(s1.timeOfDay, 'DAY');
  assert.deepEqual(s1.characters, ['MAYA', 'JONAS']); // (V.O.) stripped
  assert.deepEqual(s1.tags, { prop: ['espresso machine', 'rag'], sound: ['hiss'] });

  assert.equal(s2.intExt, 'EXT');
  assert.equal(s2.timeOfDay, 'NIGHT');
  assert.deepEqual(s2.tags, {});

  assert.equal(s3.timeOfDay, 'LATER');
  assert.ok(s1.eighths >= 1 && s3.eighths >= 1);
  assert.equal(bd.totalEighths, bd.scenes.reduce((n, s) => n + s.eighths, 0));
  assert.deepEqual(bd.characters, ['MAYA', 'JONAS']);
  assert.deepEqual(bd.locations, ['COFFEE SHOP', 'STREET']);
});

test('tags before the first scene are ignored', () => {
  const bd = buildBreakdown('<!-- @prop: ghost -->\n\n## INT. LAB - DAY\n\nHi.');
  assert.deepEqual(bd.scenes[0].tags, {});
});

test('non-standard slug falls back to OTHER', () => {
  const bd = buildBreakdown('## ON THE ROOF\n\nHi.');
  assert.equal(bd.scenes[0].intExt, 'OTHER');
  assert.equal(bd.scenes[0].location, 'ON THE ROOF');
});

test('formatEighths', () => {
  assert.equal(formatEighths(3), '3/8');
  assert.equal(formatEighths(8), '1');
  assert.equal(formatEighths(11), '1 3/8');
});

test('reports render and CSV escapes commas', () => {
  const bd = buildBreakdown(SCRIPT);
  const md = breakdownToMarkdown(bd, 'Test');
  assert.match(md, /\| 1 \| INT\. COFFEE SHOP - DAY \| INT \| COFFEE SHOP \| DAY \|/);
  assert.match(md, /\*\*MAYA\*\* — 1 scene/);
  const csv = breakdownToCsv(bd);
  assert.match(csv, /"MAYA, JONAS"/);
});

test('schedule groups by location with night last and packs by pages', () => {
  const bd = buildBreakdown(SCRIPT);
  const days = buildSchedule(bd, 5);
  const order = days.flatMap((d) => d.scenes.map((s) => s.number));
  // COFFEE SHOP scenes (1 day, 3 non-night) first, then STREET night scene.
  assert.deepEqual(order, ['1', '3', '2']);
  for (const day of days) assert.ok(day.eighths <= 40);
  const md = scheduleToMarkdown(days, 'Test', 5);
  assert.match(md, /## Day 1 — .* pgs/);
});

test('a scene larger than a day still gets scheduled alone', () => {
  const big = '## INT. HALL - DAY\n\n' + Array.from({ length: 60 }, (_, k) => `Beat ${k}.`).join('\n\n');
  const days = buildSchedule(buildBreakdown(big + '\n\n## INT. HALL - NIGHT\n\nShort.'), 1);
  assert.equal(days.length, 2);
});

test('CSV defuses formula-like cells', () => {
  const bd = buildBreakdown('## INT. LAB - DAY\n\n**=SUM(A1)**\n> hi');
  const csv = breakdownToCsv(bd);
  assert.match(csv, /,'=SUM/); // leading apostrophe defuses the formula
});

test('tags in an unclosed note still collect', () => {
  const bd = buildBreakdown('## INT. LAB - DAY\n\nHi.\n\n<!-- @prop: beaker');
  assert.deepEqual(bd.scenes[0].tags, { prop: ['beaker'] });
});

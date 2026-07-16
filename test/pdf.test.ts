import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../src/core/parser';
import { toPdf, wrap } from '../src/core/pdf';

test('wrap respects width and hard-splits long words', () => {
  assert.deepEqual(wrap('one two three', 8), ['one two', 'three']);
  assert.deepEqual(wrap('supercalifragilistic', 10), ['supercalif', 'ragilistic']);
  assert.deepEqual(wrap('a\n\nb', 5), ['a', '', 'b']);
});

test('sample screenplay renders to a multi-page PDF', async () => {
  const src = readFileSync(join(__dirname, '..', 'samples', 'coffee.screen.md'), 'utf8');
  const buffer = await toPdf(parse(src));
  assert.ok(buffer.length > 1000, 'PDF should not be empty');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  const pageCount = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  // Title page + forced page break in the sample => at least 3 pages.
  assert.ok(pageCount >= 3, `expected >= 3 pages, got ${pageCount}`);
});

test('scene numbers and dual dialog do not crash the layout', async () => {
  const src = '## INT. LAB - DAY #99#\n\n**A**\n> hi\n\n**B** ^\n> yo';
  const buffer = await toPdf(parse(src));
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
});

import { layout, paginate } from '../src/core/pdf';

const lineTexts = (page: { spans: { text: string }[] }[]) =>
  page.map((l) => l.spans.map((s) => s.text).join(' '));

test('long speech splits with (MORE) / (CONT\'D)', () => {
  const speech = Array.from({ length: 80 }, (_, k) => `> Line ${k} of the speech.`).join('\n');
  const pages = paginate(layout(parse(`**MAYA**\n${speech}`)));
  assert.ok(pages.length >= 2, 'speech should span pages');
  const p1 = lineTexts(pages[0]);
  const p2 = lineTexts(pages[1]);
  assert.equal(p1[p1.length - 1], '(MORE)');
  assert.equal(p2[0], "MAYA (CONT'D)");
});

test('short dialogue near page bottom moves whole block instead of splitting', () => {
  // Fill the page so the cue lands 2 lines from the bottom, leaving room for one body line.
  const filler = Array.from({ length: 51 }, (_, k) => `Filler ${k}.`).join('\n\n');
  const pages = paginate(layout(parse(`${filler}\n\n**MAYA**\n> One.\n> Two.\n> Three.`)));
  const all = pages.map(lineTexts);
  const moreCount = all.flat().filter((t) => t === '(MORE)').length;
  const contd = all.flat().filter((t) => t.includes("(CONT'D)")).length;
  assert.equal(moreCount, contd, 'every (MORE) pairs with a (CONT\'D)');
  // The cue must never be the last line of a page.
  for (const page of all) assert.notEqual(page[page.length - 1], 'MAYA');
});

test('dual dialogue block near page bottom moves whole to next page', () => {
  const filler = Array.from({ length: 26 }, (_, k) => `Filler ${k}.`).join('\n\n');
  const dual = '**MAYA**\n> a\n> b\n> c\n\n**JONAS** ^\n> x\n> y\n> z';
  const pages = paginate(layout(parse(`${filler}\n\n${dual}`)));
  assert.equal(pages.length, 2);
  // All 4 dual rows (cue row + 3 body rows) land together on page 2.
  const p2 = lineTexts(pages[1]);
  assert.ok(p2[0].includes('MAYA') && p2[0].includes('JONAS'), `page 2 starts with both cues, got "${p2[0]}"`);
});

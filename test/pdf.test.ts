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

test('dual dialogue block near page bottom moves whole to next page', () => {
  const filler = Array.from({ length: 26 }, (_, k) => `Filler ${k}.`).join('\n\n');
  const dual = '**MAYA**\n> a\n> b\n> c\n\n**JONAS** ^\n> x\n> y\n> z';
  const pages = paginate(layout(parse(`${filler}\n\n${dual}`)));
  assert.equal(pages.length, 2);
  // All 4 dual rows (cue row + 3 body rows) land together on page 2.
  const p2 = lineTexts(pages[1]);
  assert.ok(p2[0].includes('MAYA') && p2[0].includes('JONAS'), `page 2 starts with both cues, got "${p2[0]}"`);
});

test('sections cannot erase explicit page breaks', () => {
  const pages = paginate(layout(parse('Before.\n\n---\n\n# ACT TWO\n\nAfter.')));
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map(lineTexts), [['Before.'], ['After.']]);
});

test('exact 50-row filler leaves short dialogue intact on the next page', () => {
  const filler = Array.from({ length: 50 }, (_, i) => `Filler ${i}`).join('\n');
  const pages = paginate(layout(parse(`${filler}\n\n**MAYA**\n> One.\n> Two.\n> Three.`)));
  assert.deepEqual(lineTexts(pages[1]), ['MAYA', 'One.', 'Two.', 'Three.']);
  assert.ok(!pages.flat().some(row => row.spans.some(span => span.text === '(MORE)')));
});

test('scene heading stays with dialogue cue and speech transitively', () => {
  const filler = Array.from({ length: 49 }, (_, i) => `Filler ${i}`).join('\n');
  const pages = paginate(layout(parse(`${filler}\n\n## INT. LAB - DAY\n\n**MAYA**\n> Hello.`)));
  assert.deepEqual(lineTexts(pages[1]), ['INT. LAB - DAY', '', 'MAYA', 'Hello.']);
});

test('every text span stays inside its assigned body or scene-number gutter', () => {
  const long = 'X'.repeat(170);
  const doc = parse(`## ${long} #${'9'.repeat(30)}#\n\n**${long}**\n> hi\n\n@${long}\n\n> ${long} <`);
  for (const row of paginate(layout(doc)).flat()) {
    for (const span of row.spans) {
      const right = span.x + span.text.length * 7.2;
      assert.ok(span.x >= 72 && right <= 590.4 + 0.001, `span out of page bounds: ${span.x}..${right}`);
      if (span.x < 108) assert.ok(right <= 100.8 + 0.001, 'left gutter overlaps heading');
      else if (span.x < 547.2) assert.ok(right <= 540 + 0.001, 'body overflows');
    }
  }
});

test('oversized dual dialogue repeats cues and retains all speech exactly once', () => {
  const left = Array.from({ length: 120 }, (_, i) => `> LEFT-${i}`).join('\n');
  const right = Array.from({ length: 80 }, (_, i) => `> RIGHT-${i}`).join('\n');
  const pages = paginate(layout(parse(`## INT. LAB\n\n**MAYA**\n${left}\n\n**JONAS** ^\n${right}`)));
  assert.ok(pages.every(page => page.length <= 54));
  const texts = pages.flat().flatMap(row => row.spans.map(span => span.text));
  for (let i = 0; i < 120; i++) assert.equal(texts.filter(text => text === `LEFT-${i}`).length, 1);
  for (let i = 0; i < 80; i++) assert.equal(texts.filter(text => text === `RIGHT-${i}`).length, 1);
  assert.ok(texts.includes("MAYA (CONT'D)"));
  assert.ok(texts.includes("JONAS (CONT'D)"));
});

test('unsupported rendered glyphs and empty printable scripts reject exports', async () => {
  for (const source of ['', '<!-- note -->', '# ACT ONE', '\n---\n']) {
    await assert.rejects(toPdf(parse(source)), /no printable content/i);
  }
  await assert.rejects(toPdf(parse('## INT. LAB\n\nA 😀 appears.')), /U\+1F600.*line 3/i);
  await assert.rejects(toPdf(parse('---\ntitle: 東京\n---')), /U\+6771.*title/i);
  await assert.rejects(toPdf(parse('A\u0001B')), /U\+0001.*line 1/i);
  // The cue is uppercased before preflight: micro sign becomes unsupported Greek mu.
  await assert.rejects(toPdf(parse('**µ**\n> hi')), /U\+039C.*line 1/i);
  const title = await toPdf(parse('---\ntitle: Café — € “Yes”\n---'));
  assert.equal((title.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length, 1);
});

test('oversized title metadata is rejected rather than clipped', async () => {
  await assert.rejects(toPdf(parse(`---\ntitle: ${'Title '.repeat(300)}\n---`)), /title.*fit/i);
});


test('a scene plus page-sized dialogue splits their oversized combined keep group', () => {
  const speech = Array.from({ length: 53 }, (_, i) => `> Speech-${i}`).join('\n');
  const pages = paginate(layout(parse(`## INT. LAB\n\n**MAYA**\n${speech}`)));
  assert.equal(pages.length, 2);
  assert.ok(lineTexts(pages[0]).includes('Speech-0'));
  assert.equal(lineTexts(pages[0]).at(-1), '(MORE)');
  assert.equal(lineTexts(pages[1])[0], "MAYA (CONT'D)");
  for (let i = 0; i < 53; i++) assert.equal(lineTexts(pages.flat()).filter(text => text === `Speech-${i}`).length, 1);
});

test('wrapped continuation cues count against capacity and retain source scene ownership', () => {
  const name = 'MAYA'.repeat(20);
  const speech = Array.from({ length: 130 }, (_, i) => `> Speech-${i}`).join('\n');
  const doc = parse(`Intro.\n\n## INT. LAB\n\n**${name}**\n${speech}\n\n## EXT. LAB\n\nDone.`);
  const pages = paginate(layout(doc));
  assert.ok(pages.every(page => page.length <= 54));
  const flat = pages.flat();
  for (let i = 0; i < 130; i++) assert.equal(lineTexts(flat).filter(text => text === `Speech-${i}`).length, 1);
  assert.equal(flat[0].sceneLine, undefined);
  assert.ok(flat.filter(row => row.spans.some(span => span.text.includes('Speech-') || span.text.includes('(MORE)') || span.text.includes("(CONT'D)"))).every(row => row.sceneLine === 2));
  for (const row of flat.filter(row => row.sceneLine !== undefined)) assert.ok(doc.elements.some(el => el.kind === 'scene' && el.line === row.sceneLine));
});

test('long dialogue starts with spoken text before MORE when a parenthetical leads it', () => {
  const filler = Array.from({ length: 50 }, (_, i) => `Filler-${i}`).join('\n');
  const speech = Array.from({ length: 60 }, (_, i) => `> Speech-${i}`).join('\n');
  const pages = paginate(layout(parse(`${filler}\n\n**MAYA**\n_(quietly)_\n${speech}`)));
  assert.equal(pages[0].length, 50);
  for (const page of pages.filter(page => lineTexts(page).some(text => text.includes('MAYA')))) {
    assert.ok(lineTexts(page).some(text => text.startsWith('Speech-')));
  }
});

test('trailing parentheticals share their continuation page with retained speech', () => {
  const speech = Array.from({ length: 52 }, (_, i) => `> Speech-${i}`).join('\n');
  const tail = Array.from({ length: 20 }, (_, i) => `_(Tail-${i})_`).join('\n');
  const pages = paginate(layout(parse(`**MAYA**\n${speech}\n${tail}`)));
  assert.ok(pages.every(page => page.length <= 54));
  assert.ok(pages.every(page => lineTexts(page).some(text => text.startsWith('Speech-'))));
  const texts = lineTexts(pages.flat());
  for (let i = 0; i < 52; i++) assert.equal(texts.filter(text => text === `Speech-${i}`).length, 1);
  for (let i = 0; i < 20; i++) assert.equal(texts.filter(text => text === `(Tail-${i})`).length, 1);
});

test('dual continuation boundaries retain speech for every continuing column', () => {
  const left = Array.from({ length: 52 }, (_, i) => `> LEFT-${i}`).join('\n');
  const tail = Array.from({ length: 20 }, (_, i) => `_(Tail-${i})_`).join('\n');
  const right = Array.from({ length: 100 }, (_, i) => `> RIGHT-${i}`).join('\n');
  const pages = paginate(layout(parse(`**MAYA**\n${left}\n${tail}\n\n**JONAS** ^\n_(quietly)_\n${right}`)));
  assert.ok(pages.every(page => page.length <= 54));
  for (const page of pages) {
    const texts = page.flatMap(row => row.spans.map(span => span.text));
    if (texts.some(text => text.includes('MAYA'))) assert.ok(texts.some(text => text.startsWith('LEFT-')));
    if (texts.some(text => text.includes('JONAS'))) assert.ok(texts.some(text => text.startsWith('RIGHT-')));
  }
  const texts = pages.flat().flatMap(row => row.spans.map(span => span.text));
  for (let i = 0; i < 52; i++) assert.equal(texts.filter(text => text === `LEFT-${i}`).length, 1);
  for (let i = 0; i < 100; i++) assert.equal(texts.filter(text => text === `RIGHT-${i}`).length, 1);
});

test('impossible parenthetical runs reject instead of creating speechless continuations', async () => {
  const parens = Array.from({ length: 55 }, (_, i) => `_(Direction-${i})_`).join('\n');
  for (const body of [`${parens}\n> Speech.`, `> Speech.\n${parens}`]) {
    await assert.rejects(toPdf(parse(`**MAYA**\n${body}`)), /line 1.*speech|speech.*line 1/i);
  }
});

test('pending scenes follow their parenthetical and first spoken row onto the next page', async () => {
  const filler = Array.from({ length: 48 }, (_, i) => `Filler-${i}`).join('\n');
  const speech = Array.from({ length: 60 }, (_, i) => `> Speech-${i}`).join('\n');
  const pages = paginate(layout(parse(`${filler}\n\n## INT. LAB\n\n**MAYA**\n_(quietly)_\n${speech}`)));
  assert.equal(pages[0].length, 48);
  assert.deepEqual(lineTexts(pages[1]).slice(0, 5), ['INT. LAB', '', 'MAYA', '(quietly)', 'Speech-0']);
  const longLead = Array.from({ length: 50 }, (_, i) => `_(Direction-${i})_`).join('\n');
  await assert.rejects(toPdf(parse(`## INT. LAB\n\n**MAYA**\n${longLead}\n> First.\n> Last.`)), /Scene and dialogue.*speech/);
});

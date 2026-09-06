import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/core/parser';
import { toHtml } from '../src/core/html';
import { toFountain } from '../src/core/fountain';
import { layout, paginate } from '../src/core/pdf';
import { buildBreakdown } from '../src/core/breakdown';
import { Fountain } from 'fountain-js';

const source = readFileSync('test/fixtures/authoring.screen.md', 'utf8');
test('notes preserve the complete screenplay across preview, exports and planning', () => {
  const doc = parse(source);
  assert.equal(doc.frontmatter.title, 'Last Light');
  const first = doc.elements.find(el => el.kind === 'dialogue');
  assert.ok(first?.kind === 'dialogue');
  assert.deepEqual(first.parts, [
    { type: 'line', text: 'Leo, we lost the light.' },
    { type: 'parenthetical', text: 'into the radio' },
    { type: 'line', text: 'Can you reach the relay?' },
  ]);
  const html = toHtml(doc);
  assert.match(html, /class="sm-title">Last Light/);
  assert.match(html, /class="sm-line">Can you reach the relay\?/);
  const imported = new Fountain().parse(toFountain(doc), true);
  assert.equal(imported.title, 'Last Light');
  assert.ok(imported.tokens.some(token => token.type === 'dialogue' && token.text === 'Can you reach the relay?'));
  const pdfText = paginate(layout(doc)).flat().flatMap(row => row.spans.map(span => span.text)).join('\n');
  assert.ok(pdfText.includes('Can you reach the relay?'));
  for (const text of [html, imported.html.script, pdfText]) {
    assert.ok(!text.includes('delivery note'));
    assert.ok(!text.includes('🧪'));
  }
  const breakdown = buildBreakdown(source);
  assert.equal(breakdown.scenes.length, 3);
  assert.deepEqual(breakdown.characters, ['ADA', 'LEO']);
  assert.deepEqual(breakdown.scenes[0].tags, { prop: ['projector', 'flashlight'] });
  assert.deepEqual(breakdown.scenes[1].tags, { prop: ['radio'], sound: ['wind'] });
});

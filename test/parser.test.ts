import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, stripNotes } from '../src/core/parser';

test('frontmatter is parsed and lowercased', () => {
  const doc = parse('---\ntitle: Coffee\nDraft Date: 2026-07-15\n---\n\nAction here.');
  assert.equal(doc.frontmatter.title, 'Coffee');
  assert.equal(doc.frontmatter['draft date'], '2026-07-15');
  assert.deepEqual(doc.elements, [{ kind: 'action', text: 'Action here.', line: 5 }]);
});

test('scene heading with and without number', () => {
  const doc = parse('## INT. COFFEE SHOP - DAY\n\n## EXT. STREET - NIGHT #4A#');
  assert.deepEqual(doc.elements[0], { kind: 'scene', text: 'INT. COFFEE SHOP - DAY', number: undefined, line: 0 });
  assert.deepEqual(doc.elements[1], { kind: 'scene', text: 'EXT. STREET - NIGHT', number: '4A', line: 2 });
});

test('sections at depth 1 and 3; depth 2 is always a scene', () => {
  const doc = parse('# ACT ONE\n\n### Sequence A\n\n## INT. LAB - DAY');
  assert.deepEqual(doc.elements.map((e) => e.kind), ['section', 'section', 'scene']);
});

test('dialogue block with parenthetical, lines, and lyric', () => {
  const doc = parse('**MAYA (V.O.)**\n_(under her breath)_\n> He is late.\n> Again.\n~ la la la');
  assert.equal(doc.elements.length, 1);
  const d = doc.elements[0];
  assert.equal(d.kind, 'dialogue');
  if (d.kind === 'dialogue') {
    assert.equal(d.character, 'MAYA (V.O.)');
    assert.equal(d.dual, false);
    assert.deepEqual(d.parts, [
      { type: 'parenthetical', text: 'under her breath' },
      { type: 'line', text: 'He is late.' },
      { type: 'line', text: 'Again.' },
      { type: 'lyric', text: 'la la la' },
    ]);
  }
});

test('dual dialog marker', () => {
  const doc = parse('**MAYA**\n> Hi.\n\n**JONAS** ^\n> Hello.');
  assert.equal(doc.elements.length, 2);
  const second = doc.elements[1];
  assert.equal(second.kind === 'dialogue' && second.dual, true);
});

test('blank line ends a dialog block', () => {
  const doc = parse('**MAYA**\n> Hi.\n\n> Orphan quote.');
  assert.equal(doc.elements.length, 2);
  assert.equal(doc.elements[1].kind, 'action'); // orphan blockquote falls back to action
});

test('parenthetical outside dialog falls back to action', () => {
  const doc = parse('_(mysterious)_');
  assert.equal(doc.elements[0].kind, 'action');
});

test('centered vs dialog disambiguation', () => {
  const doc = parse('> THE END <');
  assert.deepEqual(doc.elements[0], { kind: 'centered', text: 'THE END', line: 0 });
});

test('transition, pagebreak, standalone lyric', () => {
  const doc = parse('@CUT TO:\n\n---\n\n~ Moon river');
  assert.deepEqual(doc.elements.map((e) => e.kind), ['transition', 'pagebreak', 'lyric']);
});

test('consecutive action lines merge; blank splits paragraphs', () => {
  const doc = parse('First line.\nSecond line.\n\nNew paragraph.');
  assert.equal(doc.elements.length, 2);
  assert.equal(doc.elements[0].kind === 'action' && doc.elements[0].text, 'First line.\nSecond line.');
});

test('notes are stripped but line numbers preserved', () => {
  const src = '<!-- fix\npacing -->\n## INT. LAB - DAY';
  assert.equal(stripNotes(src).split('\n').length, 3);
  const doc = parse(src);
  assert.equal(doc.elements.length, 1);
  assert.equal(doc.elements[0].line, 2);
});

test('pagebreak dashes are not confused with frontmatter', () => {
  const doc = parse('Action.\n\n---\n\nMore action.');
  assert.deepEqual(doc.elements.map((e) => e.kind), ['action', 'pagebreak', 'action']);
});

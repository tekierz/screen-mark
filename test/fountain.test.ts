import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/parser';
import { toFountain } from '../src/core/fountain';

const convert = (src: string) => toFountain(parse(src));

test('title page mapping', () => {
  const out = convert('---\ntitle: Coffee\ndraft: First Draft\ncontact: a@b.c\n---\n\nHi.');
  assert.match(out, /^Title: Coffee\n/);
  assert.match(out, /Draft date: First Draft\n/);
  assert.match(out, /Contact: a@b.c\n/);
});

test('standard slugline passes through, non-standard is dot-forced', () => {
  assert.match(convert('## INT. LAB - DAY'), /^INT\. LAB - DAY$/m);
  assert.match(convert('## ON THE ROOF'), /^\.ON THE ROOF$/m);
});

test('scene number is preserved', () => {
  assert.match(convert('## INT. LAB - DAY #4A#'), /^INT\. LAB - DAY #4A#$/m);
});

test('lowercase character cue is @-forced, dual gets caret', () => {
  const out = convert('**MAYA**\n> Hey.\n\n**McAvoy** ^\n> Hi.');
  assert.match(out, /^@McAvoy \^$/m);
  const plain = convert('**MAYA (V.O.)**\n> Hi.');
  assert.match(plain, /^@MAYA \(V\.O\.\)$/m);
});

test('dialogue parts serialize in order', () => {
  const out = convert('**MAYA**\n_(soft)_\n> Hello.\n~ la la');
  assert.match(out, /MAYA\n\(soft\)\nHello\.\n~la la/);
});

test('all-caps action line is guarded with !', () => {
  const out = convert('BANG! THE DOOR FLIES OPEN.');
  assert.match(out, /^!BANG! THE DOOR FLIES OPEN\.$/m);
});

test('transitions: standard stays plain, custom is >-forced', () => {
  assert.match(convert('@CUT TO:'), /^CUT TO:$/m);
  assert.match(convert('@whip pan'), /^> WHIP PAN$/m);
});

test('centered, section, pagebreak', () => {
  const out = convert('# ACT ONE\n\n> THE END <\n\n---');
  assert.match(out, /^# ACT ONE$/m);
  assert.match(out, /^> THE END <$/m);
  assert.match(out, /^===$/m);
});

test('only the first line of a multi-line all-caps action is guarded', () => {
  const out = convert('THUNDER CRASHES.\nLIGHTNING SPLITS THE SKY.\nThe hero stands.');
  assert.match(out, /^!THUNDER CRASHES\.\nLIGHTNING SPLITS THE SKY\.\nThe hero stands\.$/m);
});

import { Fountain } from 'fountain-js';
const imported = (source: string) => new Fountain().parse(convert(source), true);

test('independent import retains forced action and numeric/non-Roman cues', () => {
  for (const action of ['INT. THIS IS AN ACTION', '.literal', '=literal', '!literal', 'Title: literal', 'Mixed case.']) {
    const result = imported(action);
    assert.equal(result.tokens[0].type, 'action', action);
    assert.equal(result.html.script, `<p>${action}</p>`);
  }
  for (const name of ['123', '東京', 'McAvoy']) {
    const result = imported(`**${name}**\n> Hello.`);
    assert.equal(result.tokens.find(token => token.type === 'character')?.text, name);
    assert.equal(result.tokens.find(token => token.type === 'dialogue')?.text, 'Hello.');
  }
});

test('independent import preserves literal inline markers and boneyard text', () => {
  const text = '*stars* _underline_ /* literal */ C:\\temp #tag#';
  const result = imported(text);
  assert.equal(result.html.script, `<p>${text}</p>`);
});

test('independent import retains genuine structural and dialogue tokens', () => {
  const result = imported('# ACT ONE\n\n## INT. ROOM #4A#\n\n**123**\n_(quiet)_\n> Hello.\n~ la la\n\n**東京** ^\n> Bye.\n\n@CUT TO:\n\n> THE END <\n\n~ Music.\n\n---');
  const tokens = result.tokens;
  assert.equal(tokens.find(t => t.type === 'scene_heading')?.scene_number, '4A');
  for (const type of ['section', 'scene_heading', 'parenthetical', 'dialogue', 'lyrics', 'transition', 'centered', 'page_break', 'dual_dialogue_begin']) {
    assert.ok(tokens.some(t => t.type === type), type);
  }
  assert.ok(result.html.script.includes('la la'));
  assert.ok(result.html.script.includes('東京'));
});

test('unrepresentable control collisions report source locations', () => {
  for (const source of ['Visible [[literal note]] here.', '**MAYA**\n> (literal speech)', '## INT. LAB #ID WITH SPACES#', '> less < greater <', '**NAME ^ TEXT**\n> hi']) {
    assert.throws(() => convert(source), /Fountain.*line 1/i, source);
  }
});


test('independent visible text survives escaped dialogue markers and title metadata', () => {
  const speech = imported('**MAYA**\n> ~literal');
  assert.ok(speech.tokens.some(t => t.type === 'dialogue'));
  assert.equal(speech.html.script, '<div class="dialogue"><h4>MAYA</h4><p>~literal</p></div>');
  const title = imported('---\ntitle: *literal* C:\\file\n---');
  assert.equal(title.title, '*literal* C:\\file');
  assert.ok(!title.html.title_page.includes('class="italic"'));
});

test('literal note delimiters spanning dialogue parts fail before import can hide speech', () => {
  assert.throws(() => convert('**MAYA**\n> [[keep\n> this]]'), /Fountain.*literal.*line 1/i);
  assert.throws(() => convert('**MAYA**\n> Sing.\n~ [[keep\n~ this]]'), /Fountain.*literal.*line 1/i);
});

test('unmatched note brackets in separate tokens remain visible', () => {
  const result = imported('**MAYA**\n_([[keep)_\n> this]]');
  assert.ok(result.html.script.includes('([[keep)'));
  assert.ok(result.html.script.includes('this]]'));
  assert.ok(!result.html.script.includes('<!--'));
});

test('independent import keeps ambiguous transitions and bare scene prefixes in their intended types', () => {
  for (const transition of ['.CUT TO:', 'INT. TO:', 'I/E TO:', 'TO:', 'CUT TO:']) {
    const result = imported('@' + transition);
    assert.equal(result.tokens[0].type, 'transition', transition);
    assert.equal(result.html.script, `<h2>${transition}</h2>`);
  }
  for (const scene of ['INT.', 'EXT.', 'EST.', 'I/E.']) {
    const result = imported('## ' + scene);
    assert.equal(result.tokens[0].type, 'scene_heading', scene);
    assert.equal(result.html.script, `<h3>${scene}</h3>`);
  }
  assert.throws(() => convert('@INT TO:'), /Fountain.*line 1/i);
});

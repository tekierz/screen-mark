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
  const out = convert('**McAvoy** ^\n> Hi.');
  assert.match(out, /^@McAvoy \^$/m);
  const plain = convert('**MAYA (V.O.)**\n> Hi.');
  assert.match(plain, /^MAYA \(V\.O\.\)$/m);
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

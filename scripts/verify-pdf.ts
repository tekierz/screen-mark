import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from '../src/core/parser';
import { toPdf } from '../src/core/pdf';

const dir = mkdtempSync(join(tmpdir(), 'screenmark-pdf-'));
const speech = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(3, '0')}`).join('\n> ');
const source = `---
title: ${'Long title '.repeat(15)}
author: ${'Author Name '.repeat(12)}
contact: ${'Contact details '.repeat(6)}
draft: ${'Draft date '.repeat(6)}
---

## ${'LONG SCENE HEADING '.repeat(10)} #123456789#

Supported: café naïve façade £ € “quotes” ‘apostrophe’ – — …

**ALICE WITH AN EXTREMELY LONG CHARACTER NAME**
> ${speech('LEFT', 110)}

**BOB WITH AN EQUALLY LONG CHARACTER NAME** ^
> ${speech('RIGHT', 95)}

@${'LONG TRANSITION '.repeat(8)}

> ${'CENTERED WORDS '.repeat(8)} <
`;
const pdf = join(dir, 'long-fields.pdf');
writeFileSync(pdf, await toPdf(parse(source)));
execFileSync('pdftotext', ['-layout', pdf, join(dir, 'long-fields.txt')]);
execFileSync('pdftoppm', ['-scale-to', '1000', '-png', pdf, join(dir, 'long-fields')]);
const text = readFileSync(join(dir, 'long-fields.txt'), 'utf8');
for (const [prefix, count] of [['LEFT', 110], ['RIGHT', 95]] as const) {
  for (let i = 0; i < count; i++) {
    const token = `${prefix}${String(i).padStart(3, '0')}`;
    assert.equal(text.split(token).length - 1, 1, `${token} must survive exactly once`);
  }
}
for (const token of ['café', 'naïve', 'façade', '£', '€', '“quotes”', '‘apostrophe’', '–', '—', '…']) assert.ok(text.includes(token), `${token} lost in extraction`);
assert.ok(text.includes('(MORE)') && text.includes("(CONT'D)"));
console.log(`PDF extraction passed: 205 speech tokens and supported glyphs. Rendered inspection files: ${dir}`);

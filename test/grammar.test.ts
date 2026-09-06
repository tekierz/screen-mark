import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Registry, parseRawGrammar, INITIAL, IToken } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

const grammarPath = join(__dirname, '..', 'syntaxes', 'screenmark.tmLanguage.json');
const grammar = (async () => {
  const bytes = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(Uint8Array.from(bytes).buffer);
  const registry = new Registry({
    onigLib: Promise.resolve({ createOnigScanner: patterns => new OnigScanner(patterns), createOnigString: text => new OnigString(text) }),
    loadGrammar: async scope => scope === 'text.screenmark' ? parseRawGrammar(readFileSync(grammarPath, 'utf8'), grammarPath) : null,
  });
  const loaded = await registry.loadGrammar('text.screenmark');
  assert.ok(loaded);
  return loaded;
})();

async function tokenize(source: string): Promise<{ lines: string[]; tokens: IToken[][] }> {
  const loaded = await grammar;
  let state = INITIAL;
  const lines = source.split(/\r?\n/);
  const tokens = lines.map(line => {
    const result = loaded.tokenizeLine(line, state);
    state = result.ruleStack;
    return result.tokens;
  });
  return { lines, tokens };
}

function scopesAt(fixture: { lines: string[]; tokens: IToken[][] }, line: number, needle: string): string[] {
  const offset = fixture.lines[line].indexOf(needle);
  assert.ok(offset >= 0, `missing fixture text ${needle}`);
  const token = fixture.tokens[line].find(token => token.startIndex <= offset && offset < token.endIndex);
  assert.ok(token, `missing token at UTF-16 offset ${offset}`);
  return token.scopes;
}

const COMMENT = 'comment.block.html.screenmark';
const structures = [
  { line: '## INT. <!-- inside -->LAB #4<!-- id -->A# <!-- after -->', markerScope: 'punctuation.definition.heading.screenmark', text: 'LAB', scope: 'entity.name.function.scene-heading.screenmark' },
  { line: '### ACT <!-- inside -->ONE <!-- after -->', markerScope: 'punctuation.definition.heading.screenmark', text: 'ONE', scope: 'keyword.control.section.screenmark' },
  { line: '**MA<!-- inside -->YA** <!-- after --> ^', markerScope: 'punctuation.definition.bold.screenmark', text: 'YA', scope: 'entity.name.class.character.screenmark' },
  { line: '_(under <!-- inside -->breath)_ <!-- after -->', markerScope: 'punctuation.definition.italic.screenmark', text: 'breath', scope: 'support.constant.parenthetical.screenmark' },
  { line: '> THE <!-- inside -->END < <!-- after -->', markerScope: 'punctuation.definition.quote.screenmark', text: 'END', scope: 'string.other.centered.screenmark' },
  { line: '> Hello <!-- inside -->there <!-- after -->', markerScope: 'punctuation.definition.quote.screenmark', text: 'there', scope: 'string.quoted.dialog.screenmark' },
  { line: '~ Sing <!-- inside -->now <!-- after -->', markerScope: 'punctuation.definition.italic.screenmark', text: 'now', scope: 'string.quoted.lyric.screenmark' },
  { line: '@CUT <!-- inside -->TO: <!-- after -->', markerScope: 'punctuation.definition.keyword.screenmark', text: 'TO:', scope: 'keyword.control.transition.text.screenmark' },
];

for (const structure of structures) {
  test(`actual TextMate scopes preserve inline notes and markers: ${structure.scope}`, async () => {
    for (const prefix of ['  ', '<!-- before -->  ']) {
      const fixture = await tokenize(prefix + structure.line);
      assert.ok(scopesAt(fixture, 0, 'inside').includes(COMMENT));
      assert.ok(scopesAt(fixture, 0, 'after').includes(COMMENT));
      assert.ok(scopesAt(fixture, 0, structure.line).includes(structure.markerScope));
      assert.ok(scopesAt(fixture, 0, structure.text).includes(structure.scope));
      assert.ok(!scopesAt(fixture, 0, structure.text).includes(COMMENT));
      if (prefix.includes('before')) assert.ok(scopesAt(fixture, 0, 'before').includes(COMMENT));
    }
  });
}

test('scene IDs, closing cue markers, dual operators and centered markers survive notes', async () => {
  const fixture = await tokenize(structures[0].line + '\n' + structures[2].line + '\n' + structures[4].line);
  assert.ok(scopesAt(fixture, 0, '4').includes('constant.numeric.scene-number.screenmark'));
  assert.ok(scopesAt(fixture, 0, 'A#').includes('constant.numeric.scene-number.screenmark'));
  assert.ok(scopesAt(fixture, 0, 'id').includes(COMMENT));
  assert.ok(scopesAt(fixture, 1, '^').includes('keyword.operator.dual-dialog.screenmark'));
  const endCue = fixture.lines[1].lastIndexOf('**');
  assert.ok(fixture.tokens[1].find(token => token.startIndex <= endCue && token.endIndex > endCue)?.scopes.includes('punctuation.definition.bold.screenmark'));
  assert.ok(scopesAt(fixture, 2, '< <!-- after').includes('punctuation.definition.quote.screenmark'));
});

test('multiple, empty, nested-looking and marker-rich notes remain comment tokens', async () => {
  const fixture = await tokenize('## INT. <!----><!-- 😀 ** #77# )_ > <!-- nested -->LAB #1#');
  for (const text of ['<!---->', '😀', '**', '#77#', ')_', 'nested']) assert.ok(scopesAt(fixture, 0, text).includes(COMMENT), text);
  assert.ok(scopesAt(fixture, 0, 'LAB').includes('entity.name.function.scene-heading.screenmark'));
  assert.ok(!scopesAt(fixture, 0, 'LAB').includes(COMMENT));
});

test('multiline notes release structural scopes before resuming visible content', async () => {
  for (const first of ['## INT. LAB', '### ACT ONE', '**MAYA', '_(quietly', '> Dialogue', '~ Sing', '@CUT TO:']) {
    const fixture = await tokenize(`${first} <!-- start\n## hidden\n\n--> ## EXT. STREET #2#\n**JONAS**\n> Hello.`);
    assert.ok(scopesAt(fixture, 0, 'start').includes(COMMENT), first);
    assert.ok(scopesAt(fixture, 1, 'hidden').includes(COMMENT), first);
    assert.ok(scopesAt(fixture, 3, 'EXT. STREET').includes('entity.name.function.scene-heading.screenmark'), first);
    assert.ok(!scopesAt(fixture, 3, 'EXT. STREET').includes(COMMENT), first);
    assert.ok(scopesAt(fixture, 4, 'JONAS').includes('entity.name.class.character.screenmark'), first);
    assert.ok(scopesAt(fixture, 5, 'Hello').includes('string.quoted.dialog.screenmark'), first);
    assert.ok(!scopesAt(fixture, 5, 'Hello').some(scope => /scene|character|section|parenthetical/.test(scope)), first);
  }
});

test('unclosed notes persist through EOF under LF and CRLF', async () => {
  for (const eol of ['\n', '\r\n']) {
    const fixture = await tokenize(['**MAYA** <!-- unfinished', '## hidden scene', '> hidden speech'].join(eol));
    for (const [line, text] of [[0, 'unfinished'], [1, 'hidden scene'], [2, 'hidden speech']] as const) assert.ok(scopesAt(fixture, line, text).includes(COMMENT));
  }
});

test('frontmatter values tokenize inline and multiline notes and recover after closing fence', async () => {
  const fixture = await tokenize('<!-- leading -->\n---\ntitle: Cold <!-- inline -->Brew\nauthor: Maya <!-- start\n## hidden\n-->\ncredit: Written by\n---\n## INT. LAB');
  assert.ok(scopesAt(fixture, 2, 'title').includes('entity.name.tag.screenmark'));
  assert.ok(scopesAt(fixture, 2, 'inline').includes(COMMENT));
  assert.ok(scopesAt(fixture, 2, 'Brew').includes('string.unquoted.screenmark'));
  assert.ok(scopesAt(fixture, 4, 'hidden').includes(COMMENT));
  assert.ok(scopesAt(fixture, 6, 'Written').includes('string.unquoted.screenmark'));
  assert.ok(scopesAt(fixture, 8, 'LAB').includes('entity.name.function.scene-heading.screenmark'));
  assert.ok(!scopesAt(fixture, 8, 'LAB').some(scope => scope.includes('frontmatter')));
});

test('an authored leading blank prevents frontmatter highlighting', async () => {
  const fixture = await tokenize('<!-- leading -->\n\n---\ntitle: Action\n---');
  assert.ok(!scopesAt(fixture, 3, 'Action').some(scope => scope.includes('frontmatter') || scope === 'string.unquoted.screenmark'));
});

test('indented comment-only lines retain comment state and optional opening frontmatter', async () => {
  const fixture = await tokenize('  <!-- first -->\n\t<!-- second\n\nend -->\n  ---\n title: Cold Brew\n  ---\n  <!-- later -->\n## INT. LAB');
  for (const [line, text] of [[0, 'first'], [1, 'second'], [3, 'end'], [7, 'later']] as const) assert.ok(scopesAt(fixture, line, text).includes(COMMENT));
  assert.ok(scopesAt(fixture, 5, 'Cold Brew').includes('string.unquoted.screenmark'));
  assert.ok(scopesAt(fixture, 8, 'LAB').includes('entity.name.function.scene-heading.screenmark'));
});

test('notes inside action do not turn their following text into a structural prefix', async () => {
  for (const marker of ['## INT. LAB', '**MAYA**', '> dialogue', '@CUT TO:', '~ lyric']) {
    const fixture = await tokenize(`Action<!-- inline -->${marker}\n\n  <!-- standalone -->\n## EXT. STREET`);
    const scopes = scopesAt(fixture, 0, marker);
    assert.deepEqual(scopes, ['text.screenmark']);
    assert.ok(scopesAt(fixture, 2, 'standalone').includes(COMMENT));
    assert.ok(scopesAt(fixture, 3, 'STREET').includes('entity.name.function.scene-heading.screenmark'));
  }
});

test('visible suffix text keeps invalid cue and parenthetical forms as action', async () => {
  for (const line of ['**MAYA** walks.', '**MA<!-- note -->YA** walks.', '_(quietly)_ walks.', '_(quiet<!-- note -->ly)_ walks.']) {
    const fixture = await tokenize(line);
    assert.ok(!scopesAt(fixture, 0, 'walks').some(scope => /character|parenthetical/.test(scope)), line);
  }
  const fixture = await tokenize('## INT. LAB #4A# extra');
  assert.ok(!scopesAt(fixture, 0, '4A').includes('constant.numeric.scene-number.screenmark'));
});

test('a trailing unclosed note does not hide already complete visible markers', async () => {
  for (const [line, text, scope] of [
    ['**MAYA** ^ <!-- unclosed', '^', 'keyword.operator.dual-dialog.screenmark'],
    ['_(quietly)_ <!-- unclosed', 'quietly', 'support.constant.parenthetical.screenmark'],
    ['> THE END < <!-- unclosed', 'THE END', 'string.other.centered.screenmark'],
    ['## INT. LAB #4A# <!-- unclosed', '4A', 'constant.numeric.scene-number.screenmark'],
  ]) {
    const fixture = await tokenize(line + '\n## hidden');
    assert.ok(scopesAt(fixture, 0, text).includes(scope), line);
    assert.ok(scopesAt(fixture, 1, 'hidden').includes(COMMENT));
  }
});

test('frontmatter fences accept hidden tails and reject visible suffixes', async () => {
  const fixture = await tokenize('--- <!-- opening -->\ntitle: Cold Brew\n---<!-- note -->still metadata\nauthor: Maya\n--- <!-- closing -->\n## INT. LAB');
  assert.ok(scopesAt(fixture, 0, 'opening').includes(COMMENT));
  assert.ok(scopesAt(fixture, 1, 'Cold Brew').includes('string.unquoted.screenmark'));
  assert.ok(scopesAt(fixture, 3, 'Maya').includes('string.unquoted.screenmark'));
  assert.ok(scopesAt(fixture, 4, 'closing').includes(COMMENT));
  assert.ok(scopesAt(fixture, 5, 'LAB').includes('entity.name.function.scene-heading.screenmark'));
  const action = await tokenize('---<!-- note -->foo');
  assert.ok(!scopesAt(action, 0, '---').some(scope => /pagebreak|frontmatter/.test(scope)));
  assert.ok(scopesAt(action, 0, 'note').includes(COMMENT));
});

test('opening frontmatter state ends permanently at its first closing fence', async () => {
  const fixture = await tokenize('---\ntitle: Film\n---\n---\ntitle: Action\n---\n## INT. LAB');
  assert.ok(scopesAt(fixture, 1, 'Film').includes('string.unquoted.screenmark'));
  assert.ok(!scopesAt(fixture, 4, 'Action').some(scope => scope.includes('frontmatter') || scope === 'string.unquoted.screenmark'));
  assert.ok(scopesAt(fixture, 3, '---').includes('meta.separator.pagebreak.screenmark'));
  assert.ok(scopesAt(fixture, 6, 'LAB').includes('entity.name.function.scene-heading.screenmark'));
});

test('structural lookaheads stop notes at their first closer without hiding visible suffixes', async () => {
  const source = '--- <!-- note --> visible -->\n## INT. LAB\n> THE END < <!-- note --> visible -->\n**MAYA** <!-- note --> visible -->';
  const fixture = await tokenize(source);
  assert.ok(!scopesAt(fixture, 0, 'visible').some(scope => scope.includes('frontmatter') || scope === COMMENT));
  assert.ok(scopesAt(fixture, 1, 'LAB').includes('entity.name.function.scene-heading.screenmark'));
  assert.ok(scopesAt(fixture, 2, 'THE END').includes('string.quoted.dialog.screenmark'));
  assert.ok(!scopesAt(fixture, 3, 'MAYA').includes('entity.name.class.character.screenmark'));
});

test('a comment before a scene ID retains its visible whitespace boundary', async () => {
  for (const source of ['## INT. LAB <!-- id -->#4#', '## INT. LAB <!-- one --> <!-- two -->#4#']) {
    const fixture = await tokenize(source);
    assert.ok(scopesAt(fixture, 0, '4').includes('constant.numeric.scene-number.screenmark'));
  }
  const fixture = await tokenize('## INT. LAB<!-- id -->#4#');
  assert.ok(!scopesAt(fixture, 0, '4').includes('constant.numeric.scene-number.screenmark'));
  assert.ok(scopesAt(fixture, 0, 'id').includes(COMMENT));
});

test('a commented closing fence still permanently ends opening frontmatter state', async () => {
  for (const suffix of ['<!-- closing -->', ' <!-- closing -->']) {
    const fixture = await tokenize(`---\ntitle: Film\n---${suffix}\n---\ntitle: Action\n---`);
    assert.ok(scopesAt(fixture, 2, 'closing').includes(COMMENT));
    assert.ok(!scopesAt(fixture, 4, 'Action').some(scope => scope.includes('frontmatter')));
    assert.ok(scopesAt(fixture, 3, '---').includes('meta.separator.pagebreak.screenmark'));
  }
});

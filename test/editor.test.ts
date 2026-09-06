import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';

function harness(entry = 'src/extension.ts') {
  const commands: Record<string, Function> = {};
  const errors: string[] = [], edits: any[] = [], writes: any[] = [], messages: any[] = [];
  let change: Function = () => {}, active: Function = () => {}, dispose: Function = () => {};
  const disposable = { dispose() {} };
  class Position { constructor(public line: number, public character: number) {} }
  class Range { start: Position; end: Position; constructor(a: number, b: number, c: number, d: number) { this.start = new Position(a,b); this.end = new Position(c,d); } }
  const panel = { title: '', reveal() {}, webview: { html: '', postMessage(m: any) { messages.push(m); }, onDidReceiveMessage() {} }, onDidDispose(fn: Function) { dispose = fn; }, dispose() { dispose(); } };
  const api: any = {
    Position, Range, CompletionItem: class { constructor(public label: string) {} }, CompletionItemKind: {},
    WorkspaceEdit: class { insert(uri: any, position: any, text: string) { edits.push({uri,position,text}); } replace(uri: any, range: any, text: string) { edits.push({uri,range,text}); } },
    Uri: { joinPath(uri: any, name: string) { return { path: uri.path + '/' + name }; } },
    EventEmitter: class { event() {} }, ViewColumn: { Beside: 2 },
    window: { activeTextEditor: undefined, visibleTextEditors: [], showWarningMessage() {}, showInformationMessage: async () => undefined, showErrorMessage(m: string) { errors.push(m); }, showWorkspaceFolderPick: async () => undefined, showTextDocument: async () => {}, registerTreeDataProvider: () => disposable, createWebviewPanel: () => panel, onDidChangeActiveTextEditor(fn: Function) { active = fn; }, onDidChangeTextEditorVisibleRanges() {} },
    workspace: { workspaceFolders: [{uri:{path:'/one'},name:'one'},{uri:{path:'/two'},name:'two'}], getWorkspaceFolder: () => undefined, fs: {stat: async () => { throw {code:'FileNotFound'}; },writeFile: async (...args: any[]) => { writes.push(args); }}, openTextDocument: async () => ({}), applyEdit: async () => true, getConfiguration: () => ({get: () => 5}), onDidChangeTextDocument(fn: Function) { change = fn; }, createFileSystemWatcher: () => ({...disposable,onDidCreate(){},onDidDelete(){}}) },
    commands: { registerCommand(name: string, fn: Function) { commands[name] = fn; return disposable; } },
    languages: { registerCompletionItemProvider() {},registerDocumentSymbolProvider(){},registerFoldingRangeProvider(){} }, env: { openExternal: async () => false },
  };
  const code = buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false,external:['vscode','pdfkit']}).outputFiles[0].text;
  const module = {exports:{} as any};
  runInNewContext(code,{module,exports:module.exports,require: (name: string) => name === 'vscode' ? api : require(name),Buffer,setTimeout,clearTimeout,console});
  const context = {subscriptions:[]};
  module.exports.activate?.(context);
  return {api,commands,errors,edits,writes,messages,panel,context,exports:module.exports,change:(doc:any)=>change({document:doc}),active:(doc:any)=>active({document:doc})};
}
function document(text: string, path = '/two/script.smark') {
  const lines = text.split(/\r?\n/);
  return {languageId:'screenmark',uri:{path,with({path}:any){return {path};}},getText:()=>text,lineCount:lines.length,lineAt:(i:number)=>({text:lines[i],range:{end:{line:i,character:lines[i].length}}})};
}
test('numbering uses parsed scenes and original UTF-16 offsets outside comments', async () => {
  const h = harness();
  h.api.window.activeTextEditor = {document:document('---\r\n## metadata\r\n---\r\n## INT. 😀 <!-- 🧪 hidden --> ROOM <!-- tail -->\r\n## EXT. ROAD #2#')};
  await h.commands['screenmark.numberScenes']();
  assert.equal(h.edits.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.edits[0].position)),{line:3,character:'## INT. 😀 <!-- 🧪 hidden --> ROOM'.length});
});
test('completion replaces existing closing stars and filters on markers', () => {
  const h = harness('src/features/completions.ts');
  const items = new h.exports.ScreenmarkCompletionProvider().provideCompletionItems(document('**MAYA**\n> Hi\n\n**MA**'),{line:3,character:4});
  assert.equal(items[0].filterText,'**MAYA');
  assert.equal(items[0].range.end.character,6);
});
test('preview pending edit cannot switch back to previous document', async () => {
  const h = harness('src/features/preview.ts');
  const a = document('## INT. A','/a.smark'), b = document('## INT. B','/b.smark');
  h.api.window.activeTextEditor = {document:a};
  h.exports.PreviewPanel.show(h.context);
  h.change(a); h.active(b);
  await new Promise(r=>setTimeout(r,350));
  assert.equal(h.panel.title,'Preview: b.smark');
  h.change(b); await new Promise(r=>setTimeout(r,350));
  assert.match(h.messages.at(-1).body,/INT\. B/);
  h.panel.dispose();
});
test('budget destination follows active root and only FileNotFound creates', async () => {
  const h = harness();
  h.api.window.activeTextEditor = {document:document('## INT. ROOM')};
  h.api.workspace.getWorkspaceFolder = () => h.api.workspace.workspaceFolders[1];
  await h.commands['screenmark.initBudget']();
  assert.equal(h.writes[0][0].path,'/two/budget.md');
  h.writes.length = 0;
  h.api.workspace.fs.stat = async () => {throw {code:'NoPermissions'};};
  await h.commands['screenmark.initBudget']();
  assert.equal(h.writes.length,0); assert.equal(h.errors.length,1);
});
test('ambiguous folder cancellation creates nothing', async () => {
  const h = harness(); await h.commands['screenmark.initBudget'](); assert.equal(h.writes.length,0);
});
test('invalid budget input reports error without edits', async () => {
  const h = harness(); h.api.window.activeTextEditor = {document:document('## Crew\n| Item | Estimate | Actual |\n| --- | --- | --- |\n| Bad | 0x10 | 1 |','/two/budget.md')};
  await h.commands['screenmark.budgetSummary'](); assert.equal(h.edits.length,0); assert.equal(h.errors.length,1);
});
test('failed workspace edit is reported', async () => {
  const h = harness(); h.api.window.activeTextEditor = {document:document('## INT. ROOM')}; h.api.workspace.applyEdit = async () => false;
  await h.commands['screenmark.numberScenes'](); assert.equal(h.errors.length,1);
});
test('PDF and Fountain validation reject before writes', async () => {
  const h = harness();
  h.api.window.activeTextEditor = {document:document('## INT. ROOM\n\nUnsupported 😀')};
  await h.commands['screenmark.exportPdf']();
  assert.equal(h.writes.length,0);
  assert.equal(h.errors.length,1);
  h.api.window.activeTextEditor = {document:document('## INT. ROOM\n\nLiteral [[note]]')};
  await h.commands['screenmark.exportFountain']();
  assert.equal(h.writes.length,0);
  assert.equal(h.errors.length,2);
});
test('failed external PDF opening is reported', async () => {
  const h = harness();
  h.api.window.activeTextEditor = {document:document('## INT. ROOM\n\nA room.')};
  h.api.window.showInformationMessage = async () => 'Open PDF';
  await h.commands['screenmark.exportPdf']();
  assert.equal(h.writes.length,1);
  assert.match(h.errors[0],/opening PDF failed/);
});
test('disposing preview cancels pending renders', async () => {
  const h = harness('src/features/preview.ts');
  const doc = document('## INT. ROOM'); h.api.window.activeTextEditor = {document:doc};
  h.exports.PreviewPanel.show(h.context); h.change(doc);
  const count = h.messages.length; h.panel.dispose();
  await new Promise(r=>setTimeout(r,350));
  assert.equal(h.messages.length,count);
});
test('scene and transition completions include their trigger in filter text', () => {
  const h = harness('src/features/completions.ts');
  const provider = new h.exports.ScreenmarkCompletionProvider();
  assert.equal(provider.provideCompletionItems(document('## IN'),{line:0,character:5})[0].filterText,'## INT. ');
  assert.equal(provider.provideCompletionItems(document('@CU'),{line:0,character:3})[0].filterText,'@CUT TO:');
});
test('budget destination uses sole folder or explicit folder picker selection', async () => {
  const h = harness();
  h.api.window.showWorkspaceFolderPick = async () => h.api.workspace.workspaceFolders[1];
  await h.commands['screenmark.initBudget']();
  assert.equal(h.writes[0][0].path,'/two/budget.md');
  h.api.workspace.workspaceFolders = [h.api.workspace.workspaceFolders[0]];
  h.api.window.showWorkspaceFolderPick = async () => {throw new Error('single root must not prompt');};
  await h.commands['screenmark.initBudget']();
  assert.equal(h.writes[1][0].path,'/one/budget.md');
});

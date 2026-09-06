import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, message: string) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(100); }
  assert.fail(message);
}

async function authoringWorkflow(root: vscode.Uri): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, 'authoring.screen.md'));
  const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  await vscode.commands.executeCommand('screenmark.numberScenes');
  assert.match(doc.getText(), /NIGHT #1# <!-- @prop: projector/);
  assert.match(doc.getText(), /NIGHT #2A# <!-- @prop: radio/);
  assert.match(doc.getText(), /DAWN #3#/);
  const numbered = doc.getText();
  await vscode.commands.executeCommand('screenmark.numberScenes');
  assert.equal(doc.getText(), numbered);

  // Revise through the real editor typing command, then insert a hidden note
  // between a cue and its speech without introducing a separator.
  const offset = doc.getText().indexOf('Every frame.');
  editor.selection = new vscode.Selection(doc.positionAt(offset), doc.positionAt(offset + 'Every frame.'.length));
  await vscode.commands.executeCommand('type', { text: 'Every single frame.' });
  const noteAt = doc.positionAt(doc.getText().lastIndexOf('> Every single frame.'));
  editor.selection = new vscode.Selection(noteAt, noteAt);
  // Type one key at a time so the editor overtypes its auto-inserted closer.
  for (const text of '<!-- Revised delivery note. -->\n') {
    await vscode.commands.executeCommand('type', { text });
  }
  assert.match(doc.getText(), /\*\*ADA\*\*\r?\n<!-- Revised delivery note\. -->\r?\n> Every single frame\./);
  await doc.save();

  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', doc.uri);
  assert.ok(symbols);
  const tree = (nodes: vscode.DocumentSymbol[]): unknown[] => nodes.map(node => ({ name: node.name, children: tree(node.children) }));
  assert.deepEqual(tree(symbols), [
    { name: 'ACT ONE', children: [
      { name: 'At the booth', children: [
        { name: '1. INT. PROJECTION BOOTH - NIGHT', children: [] },
        { name: 'On the wire', children: [{ name: '2A. EXT. ROOFTOP - NIGHT', children: [] }] },
      ] },
    ] },
    { name: 'ACT TWO', children: [{ name: '3. INT. PROJECTION BOOTH - DAWN', children: [] }] },
  ]);
  await vscode.commands.executeCommand('screenmark.openPreview');
  await delay(400);
  assert.ok(vscode.window.tabGroups.all.flatMap(group => group.tabs).some(tab => tab.label === 'Preview: authoring.screen.md'));

  await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  await vscode.commands.executeCommand('screenmark.exportFountain');
  const fountain = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'authoring.fountain'))).toString();
  assert.match(fountain, /^Title: Last Light/m);
  assert.match(fountain, /@ADA\nEvery single frame\./);
  assert.match(fountain, /Leo, we lost the light\.\n\(into the radio\)\nCan you reach the relay\?/);
  assert.ok(!fountain.includes('delivery note'));

  await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  void vscode.commands.executeCommand('screenmark.exportPdf');
  const pdf = vscode.Uri.joinPath(root, 'authoring.pdf');
  await eventually(() => existsSync(pdf.fsPath), 'Revised screenplay PDF must be written');
  const extracted = execFileSync('pdftotext', [pdf.fsPath, '-'], { encoding: 'utf8' });
  assert.ok(extracted.includes('LAST LIGHT'));
  assert.ok(extracted.includes('Every single frame.'));
  assert.ok(extracted.includes('Can you reach the relay?'));
  assert.ok(!extracted.includes('delivery note'));

  await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  await vscode.commands.executeCommand('screenmark.generateBreakdown');
  const breakdown = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'authoring.breakdown.md'))).toString();
  assert.match(breakdown, /Scene Breakdown — Last Light/);
  assert.match(breakdown, /Total: 3 scenes/);
  assert.match(breakdown, /Speaking cast/);
  assert.match(breakdown, /projector, flashlight/);
  const csv = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'authoring.breakdown.csv'))).toString();
  assert.equal(csv.trim().split('\n').length, 4);
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  await vscode.commands.executeCommand('screenmark.generateSchedule');
  const schedule = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'authoring.schedule.md'))).toString();
  assert.match(schedule, /Shooting Schedule — Last Light/);
  assert.match(schedule, /3 scenes over 1 day/);
  assert.match(schedule, /\| 2A \| EXT\. ROOFTOP/);
}
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('tikilabs.screen-mark');
  assert.ok(extension, 'ScreenMark installed');
  await extension.activate();
  const expected = process.env.SCREENMARK_EXPECTED_EXTENSION!;
  assert.equal(realpathSync(extension.extensionPath), realpathSync(expected));
  assert.ok(existsSync(join(expected, 'dist/extension.js')));
  assert.ok(existsSync(join(expected, 'dist/data/Courier.afm')), 'bundled PDF font data');
  const roots = vscode.workspace.workspaceFolders!;
  assert.equal(roots.length, 2);
  const a = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(roots[0].uri, 'a.smark'));
  const b = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(roots[1].uri, 'b.smark'));
  const editor = await vscode.window.showTextDocument(a);
  await vscode.commands.executeCommand('screenmark.numberScenes');
  assert.match(a.getText(), /## INT\. 😀 <!-- 🧪 hidden --> ROOM #1# <!-- tail -->/);
  assert.match(a.getText(), /## metadata\r?\n/);
  const numbered = a.getText();
  await vscode.commands.executeCommand('screenmark.numberScenes');
  assert.equal(a.getText(), numbered);
  await delay(1000); // Allow the language configuration contribution to reach the editor.
  editor.selection = new vscode.Selection(a.lineCount - 1, 0, a.lineCount - 1, 0);
  await vscode.commands.executeCommand('type', {text:'*'});
  await vscode.commands.executeCommand('type', {text:'*'});
  await vscode.commands.executeCommand('type', {text:'MA'});
  assert.equal(a.lineAt(editor.selection.active.line).text, '**MA**', 'actual auto-closing');
  await vscode.commands.executeCommand('editor.action.triggerSuggest');
  await delay(800);
  await vscode.commands.executeCommand('acceptSelectedSuggestion');
  await eventually(() => a.getText().replace(/\r\n/g, '\n').endsWith('**MAYA**\n> '), 'suggest widget must accept complete MAYA cue');
  await vscode.commands.executeCommand('screenmark.openPreview');
  await editor.edit(edit => edit.insert(new vscode.Position(0,0),'<!-- edit A -->\n'));
  const bEditor = await vscode.window.showTextDocument(b, vscode.ViewColumn.One);
  await delay(450);
  const preview = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab => tab.input instanceof vscode.TabInputWebview);
  assert.equal(preview()?.label, 'Preview: b.smark');
  await bEditor.edit(edit => edit.insert(new vscode.Position(b.lineCount - 1,0),'B edit.'));
  await delay(450);
  assert.equal(preview()?.label, 'Preview: b.smark');
  await vscode.commands.executeCommand('screenmark.initBudget');
  assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, vscode.Uri.joinPath(roots[1].uri,'budget.md').fsPath);
  assert.equal(existsSync(vscode.Uri.joinPath(roots[0].uri,'budget.md').fsPath),false);
  await vscode.commands.executeCommand('screenmark.budgetSummary');
  const budget = vscode.window.activeTextEditor!.document;
  const totals = budget.getText();
  assert.match(totals,/Totals/);
  await vscode.commands.executeCommand('screenmark.budgetSummary');
  assert.equal(budget.getText(),totals);
  await vscode.window.showTextDocument(b);
  void vscode.commands.executeCommand('screenmark.exportPdf');
  await eventually(() => existsSync(vscode.Uri.joinPath(roots[1].uri,'b.pdf').fsPath), 'PDF export must write bundled-runtime output');
  const pdf = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(roots[1].uri,'b.pdf'));
  assert.equal(Buffer.from(pdf).subarray(0,4).toString(),'%PDF');
  await authoringWorkflow(roots[1].uri);
  writeFileSync(process.env.SCREENMARK_SMOKE_RESULT!, JSON.stringify({editor:vscode.version,extensionPath:extension.extensionPath,version:extension.packageJSON.version,checks:['UTF-16 comment numbering and idempotence','real auto-close typing and suggest acceptance','preview document switching','second-root budget and refresh','packaged PDF runtime','nested document-symbol hierarchy','short-screenplay typing and hidden-note revision','revised PDF extraction and Fountain export','scene breakdown CSV/Markdown and shooting schedule']},null,2));
}

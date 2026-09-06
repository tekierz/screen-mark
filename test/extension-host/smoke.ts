import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, message: string) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(100); }
  assert.fail(message);
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
  writeFileSync(process.env.SCREENMARK_SMOKE_RESULT!, JSON.stringify({editor:vscode.version,extensionPath:extension.extensionPath,version:extension.packageJSON.version,checks:['UTF-16 comment numbering and idempotence','real auto-close typing and suggest acceptance','preview document switching','second-root budget and refresh','packaged PDF runtime']},null,2));
}

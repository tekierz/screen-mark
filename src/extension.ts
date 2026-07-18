import * as vscode from 'vscode';
import { parse, stripNotes, SCENE_RE } from './core/parser';
import { toFountain } from './core/fountain';
import { toPdf } from './core/pdf';
import { buildBreakdown, breakdownToMarkdown, breakdownToCsv } from './core/breakdown';
import { buildSchedule, scheduleToMarkdown } from './core/schedule';
import { budgetTemplate, upsertTotals } from './core/budget';
import { PreviewPanel } from './features/preview';
import { ScreenmarkCompletionProvider } from './features/completions';
import { ScreenmarkSymbolProvider, ScreenmarkFoldingProvider } from './features/symbols';
import { registerProjectTree } from './features/projectTree';
import { registerActionsTree } from './features/actionsTree';

const LANG = 'screenmark';

function activeScreenmarkEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANG) {
    vscode.window.showWarningMessage('Open a ScreenMark file (.smark or *.screen.md) first.');
    return undefined;
  }
  return editor;
}

function siblingUri(doc: vscode.TextDocument, ext: string): vscode.Uri {
  const base = doc.uri.path.replace(/(\.screen)?\.(md|smark)$/i, '');
  return doc.uri.with({ path: base + ext });
}

async function exportPdf(): Promise<void> {
  const editor = activeScreenmarkEditor();
  if (!editor) return;
  const target = siblingUri(editor.document, '.pdf');
  try {
    const buffer = await toPdf(parse(editor.document.getText()));
    await vscode.workspace.fs.writeFile(target, buffer);
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: PDF export failed — ${err}`);
    return;
  }
  const open = 'Open PDF';
  const picked = await vscode.window.showInformationMessage(`Exported ${target.path.split('/').pop()}`, open);
  if (picked === open) vscode.env.openExternal(target);
}

async function exportFountain(): Promise<void> {
  const editor = activeScreenmarkEditor();
  if (!editor) return;
  const target = siblingUri(editor.document, '.fountain');
  try {
    await vscode.workspace.fs.writeFile(target, Buffer.from(toFountain(parse(editor.document.getText())), 'utf8'));
    const doc = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: Fountain export failed — ${err}`);
  }
}

async function numberScenes(): Promise<void> {
  const editor = activeScreenmarkEditor();
  if (!editor) return;
  const doc = editor.document;

  const used = new Set<number>();
  const unnumbered: number[] = [];
  // Scan note-stripped lines so `## ...` inside <!-- --> is ignored, like the parser does.
  const lines = stripNotes(doc.getText()).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(SCENE_RE);
    if (!m) continue;
    if (m[2]) {
      const n = parseInt(m[2], 10);
      if (!isNaN(n)) used.add(n);
    } else {
      unnumbered.push(i);
    }
  }
  if (unnumbered.length === 0) {
    vscode.window.showInformationMessage('ScreenMark: all scenes are already numbered.');
    return;
  }

  let next = 1;
  const edit = new vscode.WorkspaceEdit();
  for (const lineNo of unnumbered) {
    while (used.has(next)) next++;
    used.add(next);
    const line = doc.lineAt(lineNo);
    edit.insert(doc.uri, line.range.end, ` #${next}#`);
  }
  await vscode.workspace.applyEdit(edit);
}

function scriptTitle(editor: vscode.TextEditor): string {
  const fm = parse(editor.document.getText()).frontmatter;
  return fm.title ?? editor.document.uri.path.split('/').pop()!.replace(/(\.screen)?\.(md|smark)$/i, '');
}

async function writeAndOpen(target: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

async function generateBreakdown(): Promise<void> {
  const editor = activeScreenmarkEditor();
  if (!editor) return;
  const bd = buildBreakdown(editor.document.getText());
  if (bd.scenes.length === 0) {
    vscode.window.showWarningMessage('ScreenMark: no scene headings (## INT. ...) found.');
    return;
  }
  try {
    await vscode.workspace.fs.writeFile(
      siblingUri(editor.document, '.breakdown.csv'),
      Buffer.from(breakdownToCsv(bd), 'utf8')
    );
    await writeAndOpen(siblingUri(editor.document, '.breakdown.md'), breakdownToMarkdown(bd, scriptTitle(editor)));
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: breakdown failed — ${err}`);
  }
}

async function generateSchedule(): Promise<void> {
  const editor = activeScreenmarkEditor();
  if (!editor) return;
  const bd = buildBreakdown(editor.document.getText());
  if (bd.scenes.length === 0) {
    vscode.window.showWarningMessage('ScreenMark: no scene headings (## INT. ...) found.');
    return;
  }
  const pagesPerDay = vscode.workspace.getConfiguration('screenmark').get<number>('pagesPerDay', 5);
  try {
    const days = buildSchedule(bd, pagesPerDay);
    await writeAndOpen(siblingUri(editor.document, '.schedule.md'), scheduleToMarkdown(days, scriptTitle(editor), pagesPerDay));
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: schedule failed — ${err}`);
  }
}

async function initBudget(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ScreenMark: open a folder first.');
    return;
  }
  const target = vscode.Uri.joinPath(folder.uri, 'budget.md');
  try {
    await vscode.workspace.fs.stat(target);
  } catch {
    const editor = vscode.window.activeTextEditor;
    const title =
      editor && editor.document.languageId === LANG ? scriptTitle(editor) : folder.name;
    await vscode.workspace.fs.writeFile(target, Buffer.from(budgetTemplate(title), 'utf8'));
  }
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc);
}

async function budgetSummary(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !/\.md$/i.test(editor.document.uri.path) || !/estimate/i.test(editor.document.getText())) {
    vscode.window.showWarningMessage('ScreenMark: open a budget markdown file (tables with an Estimate column) first.');
    return;
  }
  const updated = upsertTotals(editor.document.getText());
  const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(editor.document.uri, fullRange, updated);
  await vscode.workspace.applyEdit(edit);
}

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: LANG };
  context.subscriptions.push(
    vscode.commands.registerCommand('screenmark.exportPdf', exportPdf),
    vscode.commands.registerCommand('screenmark.exportFountain', exportFountain),
    vscode.commands.registerCommand('screenmark.numberScenes', numberScenes),
    vscode.commands.registerCommand('screenmark.openPreview', () => PreviewPanel.show(context)),
    vscode.commands.registerCommand('screenmark.generateBreakdown', generateBreakdown),
    vscode.commands.registerCommand('screenmark.generateSchedule', generateSchedule),
    vscode.commands.registerCommand('screenmark.initBudget', initBudget),
    vscode.commands.registerCommand('screenmark.budgetSummary', budgetSummary),
    vscode.languages.registerCompletionItemProvider(selector, new ScreenmarkCompletionProvider(), '*', '#', '@'),
    vscode.languages.registerDocumentSymbolProvider(selector, new ScreenmarkSymbolProvider()),
    vscode.languages.registerFoldingRangeProvider(selector, new ScreenmarkFoldingProvider())
  );
  registerProjectTree(context);
  registerActionsTree(context);
}

export function deactivate(): void {}

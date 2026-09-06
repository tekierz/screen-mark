import * as vscode from 'vscode';
import { parse } from './core/parser';
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
  if (picked === open) {
    try {
      if (!await vscode.env.openExternal(target)) throw new Error('The editor could not open the PDF.');
    } catch (err) {
      vscode.window.showErrorMessage(`ScreenMark: opening PDF failed — ${err}`);
    }
  }
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

  try {
    const text = doc.getText();
    const scenes = parse(text).elements.filter((el) => el.kind === 'scene');
    const used = new Set(scenes.map((scene) => Number.parseInt(scene.number ?? '', 10)).filter(Number.isFinite));
    const unnumbered = scenes.filter((scene) => !scene.number);
    if (!unnumbered.length) {
      vscode.window.showInformationMessage('ScreenMark: all scenes are already numbered.');
      return;
    }
    // Replace each comment code unit with a space, retaining original UTF-16 positions.
    const visible = text.replace(/<!--[\s\S]*?(-->|$)/g, (note) => note.replace(/[^\r\n]/g, ' ')).split(/\r?\n/);
    let next = 1;
    const edit = new vscode.WorkspaceEdit();
    for (const scene of unnumbered) {
      while (used.has(next)) next++;
      used.add(next);
      edit.insert(doc.uri, new vscode.Position(scene.line, visible[scene.line].trimEnd().length), ` #${next}#`);
    }
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('The editor did not apply scene numbers.');
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: scene numbering failed — ${err}`);
  }
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
  try {
    const bd = buildBreakdown(editor.document.getText());
    if (bd.scenes.length === 0) {
      vscode.window.showWarningMessage('ScreenMark: no scene headings (## INT. ...) found.');
      return;
    }
    const csv = breakdownToCsv(bd);
    const markdown = breakdownToMarkdown(bd, scriptTitle(editor));
    await vscode.workspace.fs.writeFile(
      siblingUri(editor.document, '.breakdown.csv'),
      Buffer.from(csv, 'utf8')
    );
    await writeAndOpen(siblingUri(editor.document, '.breakdown.md'), markdown);
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: breakdown failed — ${err}`);
  }
}

async function generateSchedule(): Promise<void> {
  const editor = activeScreenmarkEditor();
  if (!editor) return;
  try {
    const bd = buildBreakdown(editor.document.getText());
    if (bd.scenes.length === 0) {
      vscode.window.showWarningMessage('ScreenMark: no scene headings (## INT. ...) found.');
      return;
    }
    const pagesPerDay = vscode.workspace.getConfiguration('screenmark').get<number>('pagesPerDay', 5);
    const days = buildSchedule(bd, pagesPerDay);
    await writeAndOpen(siblingUri(editor.document, '.schedule.md'), scheduleToMarkdown(days, scriptTitle(editor), pagesPerDay));
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: schedule failed — ${err}`);
  }
}

async function initBudget(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      vscode.window.showWarningMessage('ScreenMark: open a folder first.');
      return;
    }
    const folder = (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri))
      || (folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick());
    if (!folder) return;
    const target = vscode.Uri.joinPath(folder.uri, 'budget.md');
    try {
      await vscode.workspace.fs.stat(target);
    } catch (err) {
      if ((err as { code?: string }).code !== 'FileNotFound') throw err;
      const title = editor?.document.languageId === LANG ? scriptTitle(editor) : folder.name;
      await vscode.workspace.fs.writeFile(target, Buffer.from(budgetTemplate(title), 'utf8'));
    }
    const doc = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(doc);
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: budget creation failed — ${err}`);
  }
}

async function budgetSummary(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !/\.md$/i.test(editor.document.uri.path) || !/estimate/i.test(editor.document.getText())) {
    vscode.window.showWarningMessage('ScreenMark: open a budget markdown file (tables with an Estimate column) first.');
    return;
  }
  try {
    const original = editor.document.getText();
    const updated = upsertTotals(original);
    if (updated === original) return;
    const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, fullRange, updated);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('The editor did not apply budget totals.');
  } catch (err) {
    vscode.window.showErrorMessage(`ScreenMark: budget summary failed — ${err}`);
  }
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

import * as vscode from 'vscode';
import { parse } from '../core/parser';

const TRANSITIONS = ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:'];

export class ScreenmarkCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    const lineRange = new vscode.Range(position.line, 0, position.line, position.character);

    // **CHAR — suggest known character names
    if (/^\*\*?[^*]*$/.test(prefix)) {
      const { elements } = parse(document.getText());
      const names: string[] = [];
      for (const el of elements) {
        if (el.kind === 'dialogue' && el.line !== position.line && !names.includes(el.character)) {
          names.push(el.character);
        }
      }
      return names.reverse().map((name, idx) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.User);
        item.insertText = `**${name}**\n> `;
        item.filterText = `${prefix.startsWith('**') ? '**' : '*'}${name}`;
        const suffix = document.lineAt(position.line).text.slice(position.character).match(/^\*{1,2}/)?.[0] ?? '';
        item.range = new vscode.Range(position.line, 0, position.line, position.character + suffix.length);
        item.sortText = String(idx).padStart(3, '0'); // most recently used first
        return item;
      });
    }

    // ## — suggest INT./EXT. and known sluglines
    if (/^##\s*[^#]*$/.test(prefix)) {
      const { elements } = parse(document.getText());
      const slugs = new Set<string>(['INT. ', 'EXT. ', 'INT./EXT. ']);
      for (const el of elements) {
        if (el.kind === 'scene' && el.line !== position.line) slugs.add(el.text);
      }
      return [...slugs].map((slug) => {
        const item = new vscode.CompletionItem(slug, vscode.CompletionItemKind.Module);
        item.insertText = `## ${slug}`;
        item.filterText = `## ${slug}`;
        item.range = lineRange;
        return item;
      });
    }

    // @ — suggest standard transitions
    if (/^@[^@]*$/.test(prefix)) {
      return TRANSITIONS.map((t) => {
        const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.Keyword);
        item.insertText = `@${t}`;
        item.filterText = `@${t}`;
        item.range = lineRange;
        return item;
      });
    }

    return undefined;
  }
}

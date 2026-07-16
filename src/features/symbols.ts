import * as vscode from 'vscode';
import { parse } from '../core/parser';
import { Element } from '../core/ast';

function lineRange(document: vscode.TextDocument, from: number, to: number): vscode.Range {
  return new vscode.Range(from, 0, to, document.lineAt(to).text.length);
}

/** End line of the block starting at elements[idx]: the line before the next scene/section boundary. */
function blockEnd(elements: Element[], idx: number, lastLine: number, minDepth?: number): number {
  for (let j = idx + 1; j < elements.length; j++) {
    const el = elements[j];
    if (el.kind === 'scene' && minDepth === undefined) return el.line - 1;
    if (el.kind === 'section' && (minDepth === undefined || el.depth <= minDepth)) return el.line - 1;
  }
  return lastLine;
}

export class ScreenmarkSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const { elements } = parse(document.getText());
    const last = document.lineCount - 1;
    const root: vscode.DocumentSymbol[] = [];
    let currentSection: vscode.DocumentSymbol | undefined;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.kind === 'section') {
        const range = lineRange(document, el.line, blockEnd(elements, i, last, el.depth));
        const sym = new vscode.DocumentSymbol(el.text, '', vscode.SymbolKind.Namespace, range, lineRange(document, el.line, el.line));
        root.push(sym);
        currentSection = sym;
      } else if (el.kind === 'scene') {
        const name = el.number ? `${el.number}. ${el.text}` : el.text;
        const range = lineRange(document, el.line, blockEnd(elements, i, last));
        const sym = new vscode.DocumentSymbol(name, '', vscode.SymbolKind.Event, range, lineRange(document, el.line, el.line));
        if (currentSection && currentSection.range.contains(range.start)) currentSection.children.push(sym);
        else root.push(sym);
      }
    }
    return root;
  }
}

export class ScreenmarkFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const { elements } = parse(document.getText());
    const last = document.lineCount - 1;
    const ranges: vscode.FoldingRange[] = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.kind !== 'scene' && el.kind !== 'section') continue;
      const end = blockEnd(elements, i, last, el.kind === 'section' ? el.depth : undefined);
      if (end > el.line) ranges.push(new vscode.FoldingRange(el.line, end, vscode.FoldingRangeKind.Region));
    }
    return ranges;
  }
}

import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { parse } from '../core/parser';
import { toHtml, SCREENPLAY_CSS } from '../core/html';

const LANG = 'screenmark';

export class PreviewPanel {
  private static current: PreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private trackedDoc: vscode.TextDocument | undefined;
  private lastRender: { body: string; line: number } | undefined;

  static show(context: vscode.ExtensionContext): void {
    const doc = vscode.window.activeTextEditor?.document;
    if (PreviewPanel.current) {
      PreviewPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
      PreviewPanel.current.update(doc);
      return;
    }
    PreviewPanel.current = new PreviewPanel(context);
    PreviewPanel.current.update(doc);
  }

  private constructor(context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(
      'screenmark.preview',
      'Screenplay Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true }
    );
    // The shell is set exactly once; all further updates go over postMessage so
    // the webview never reloads (full html reassignment on each keystroke is
    // what made the panel flash and get killed under memory pressure).
    this.panel.webview.html = this.shell();
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        // Sent on every (re)load of the shell — including after the webview was
        // discarded while hidden — so always re-send the latest render.
        if (msg?.type === 'ready') this.flush();
      },
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document === this.trackedDoc) this.scheduleUpdate(e.document);
      },
      null,
      this.disposables
    );
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor?.document.languageId === LANG && editor.document !== this.trackedDoc) {
          this.update(editor.document);
        }
      },
      null,
      this.disposables
    );
    vscode.window.onDidChangeTextEditorVisibleRanges(
      (e) => {
        if (e.textEditor.document === this.trackedDoc) {
          const line = e.visibleRanges[0]?.start.line;
          if (line !== undefined) this.panel.webview.postMessage({ type: 'reveal', line });
        }
      },
      null,
      this.disposables
    );
    context.subscriptions.push(this.panel);
  }

  private scheduleUpdate(doc: vscode.TextDocument): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.update(doc), 300);
  }

  private topVisibleLine(doc: vscode.TextDocument): number {
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
    return editor?.visibleRanges[0]?.start.line ?? 0;
  }

  private update(doc: vscode.TextDocument | undefined): void {
    if (!doc || doc.languageId !== LANG) return;
    this.trackedDoc = doc;
    this.panel.title = `Preview: ${doc.uri.path.split('/').pop()}`;
    this.lastRender = {
      body: toHtml(parse(doc.getText())),
      line: this.topVisibleLine(doc),
    };
    this.flush();
  }

  private flush(): void {
    // postMessage is dropped while the webview is hidden; lastRender is
    // re-flushed by the 'ready' handshake when it comes back.
    if (this.lastRender) this.panel.webview.postMessage({ type: 'render', ...this.lastRender });
  }

  private shell(): string {
    const nonce = randomBytes(16).toString('base64');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${SCREENPLAY_CSS}</style>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  var firstRender = true;
  function reveal(line) {
    var best = null;
    var els = document.querySelectorAll('[data-line]');
    for (var i = 0; i < els.length; i++) {
      if (Number(els[i].getAttribute('data-line')) <= line) best = els[i];
      else break;
    }
    if (best) best.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }
  window.addEventListener('message', function (e) {
    var m = e.data || {};
    if (m.type === 'render') {
      document.getElementById('root').innerHTML = m.body;
      if (firstRender) {
        firstRender = false;
        if (m.line > 0) reveal(m.line);
      }
    } else if (m.type === 'reveal') {
      reveal(m.line);
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
  }

  private dispose(): void {
    PreviewPanel.current = undefined;
    if (this.timer) clearTimeout(this.timer);
    for (const d of this.disposables) d.dispose();
  }
}

import * as vscode from 'vscode';

interface Node {
  uri: vscode.Uri;
  label: string;
  icon: vscode.ThemeIcon;
  children?: Node[];
}

/** Sibling docs shown under each script, when they exist on disk. */
const SIBLINGS: { ext: string; label: string; icon: string }[] = [
  { ext: '.breakdown.md', label: 'Scene breakdown', icon: 'checklist' },
  { ext: '.breakdown.csv', label: 'Breakdown (CSV)', icon: 'table' },
  { ext: '.schedule.md', label: 'Shooting schedule', icon: 'calendar' },
  { ext: '.pdf', label: 'Screenplay PDF', icon: 'file-pdf' },
  { ext: '.fountain', label: 'Fountain export', icon: 'export' },
];

export function scriptBase(uri: vscode.Uri): string {
  return uri.path.replace(/(\.screen)?\.(md|smark)$/i, '');
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = node.icon;
    item.resourceUri = node.uri;
    item.tooltip = node.uri.fsPath;
    item.command = { command: 'vscode.open', title: 'Open', arguments: [node.uri] };
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node) return node.children ?? [];

    const scripts = await vscode.workspace.findFiles('**/*.{smark,screen.md}', '**/node_modules/**');
    scripts.sort((a, b) => a.path.localeCompare(b.path));

    const roots: Node[] = [];
    for (const script of scripts) {
      const base = scriptBase(script);
      const children: Node[] = [];
      for (const sib of SIBLINGS) {
        const uri = script.with({ path: base + sib.ext });
        if (await exists(uri)) {
          children.push({ uri, label: sib.label, icon: new vscode.ThemeIcon(sib.icon) });
        }
      }
      roots.push({
        uri: script,
        label: script.path.split('/').pop()!,
        icon: new vscode.ThemeIcon('book'),
        children,
      });
    }

    const budgets = await vscode.workspace.findFiles('**/budget*.md', '**/node_modules/**');
    for (const budget of budgets.sort((a, b) => a.path.localeCompare(b.path))) {
      roots.push({
        uri: budget,
        label: budget.path.split('/').pop()!,
        icon: new vscode.ThemeIcon('credit-card'),
      });
    }
    return roots;
  }
}

export function registerProjectTree(context: vscode.ExtensionContext): ProjectTreeProvider {
  const provider = new ProjectTreeProvider();
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{smark,md,csv,pdf,fountain}');
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('screenmarkProject', provider),
    vscode.commands.registerCommand('screenmark.refreshProject', () => provider.refresh()),
    watcher
  );
  return provider;
}

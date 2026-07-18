import * as vscode from 'vscode';

interface Action {
  label: string;
  command: string;
  icon: string;
  detail: string;
}

interface Group {
  label: string;
  actions: Action[];
}

const GROUPS: Group[] = [
  {
    label: 'Export',
    actions: [
      { label: 'Open Preview', command: 'screenmark.openPreview', icon: 'open-preview', detail: 'Live formatted preview' },
      { label: 'Export PDF', command: 'screenmark.exportPdf', icon: 'file-pdf', detail: 'Industry-formatted screenplay' },
      { label: 'Export Fountain', command: 'screenmark.exportFountain', icon: 'export', detail: 'For Highland, Final Draft…' },
    ],
  },
  {
    label: 'Script',
    actions: [
      { label: 'Number Scenes', command: 'screenmark.numberScenes', icon: 'list-ordered', detail: 'Fill in missing scene numbers' },
    ],
  },
  {
    label: 'Production',
    actions: [
      { label: 'Scene Breakdown', command: 'screenmark.generateBreakdown', icon: 'checklist', detail: 'Report + CSV' },
      { label: 'Shooting Schedule', command: 'screenmark.generateSchedule', icon: 'calendar', detail: 'Scenes packed into days' },
      { label: 'Init Budget', command: 'screenmark.initBudget', icon: 'credit-card', detail: 'Scaffold budget.md' },
      { label: 'Budget Summary', command: 'screenmark.budgetSummary', icon: 'symbol-number', detail: 'Recompute totals' },
    ],
  },
];

type Node = { kind: 'group'; group: Group } | { kind: 'action'; action: Action };

export class ActionsTreeProvider implements vscode.TreeDataProvider<Node> {
  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'group';
      return item;
    }
    const { action } = node;
    const item = new vscode.TreeItem(action.label, vscode.TreeItemCollapsibleState.None);
    item.description = action.detail;
    item.tooltip = action.detail;
    item.iconPath = new vscode.ThemeIcon(action.icon);
    item.command = { command: action.command, title: action.label };
    item.contextValue = 'action';
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) return GROUPS.map((group) => ({ kind: 'group', group }));
    if (node.kind === 'group') return node.group.actions.map((action) => ({ kind: 'action', action }));
    return [];
  }
}

export function registerActionsTree(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('screenmarkActions', new ActionsTreeProvider())
  );
}

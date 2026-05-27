export type ShortcutAction =
  | 'openFiles'
  | 'openDirectory'
  | 'focusSearch'
  | 'clearLogs'
  | 'closeTab'
  | 'reloadActive'
  | 'toggleSidebar'
  | 'toggleSettings'
  | 'nextSearchMatch'
  | 'previousSearchMatch';

export interface ShortcutDefinition {
  action: ShortcutAction;
  label: string;
  keys: string;
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { action: 'openFiles', label: 'Open files', keys: 'Ctrl+O' },
  { action: 'openDirectory', label: 'Open folder', keys: 'Ctrl+Shift+O' },
  { action: 'focusSearch', label: 'Focus search', keys: 'Ctrl+F' },
  { action: 'clearLogs', label: 'Clear active logs', keys: 'Ctrl+L' },
  { action: 'closeTab', label: 'Close active tab', keys: 'Ctrl+W' },
  { action: 'reloadActive', label: 'Reload active file', keys: 'Ctrl+R' },
  { action: 'toggleSidebar', label: 'Toggle sidebar', keys: 'Ctrl+B' },
  { action: 'toggleSettings', label: 'Open settings', keys: 'Ctrl+,' },
  { action: 'nextSearchMatch', label: 'Next search match', keys: 'Enter' },
  { action: 'previousSearchMatch', label: 'Previous search match', keys: 'Shift+Enter' },
];

export const getShortcutLabel = (action: ShortcutAction): string => {
  return SHORTCUTS.find((shortcut) => shortcut.action === action)?.keys ?? '';
};

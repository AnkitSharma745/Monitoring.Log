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
  { action: 'openFiles', label: 'Open files', keys: 'Ctrl/Cmd+O' },
  { action: 'openDirectory', label: 'Open folder', keys: 'Ctrl/Cmd+Shift+O' },
  { action: 'focusSearch', label: 'Focus search', keys: 'Ctrl/Cmd+F' },
  { action: 'clearLogs', label: 'Clear active logs', keys: 'Ctrl/Cmd+L' },
  { action: 'closeTab', label: 'Close active tab', keys: 'Ctrl/Cmd+W' },
  { action: 'reloadActive', label: 'Reload active file', keys: 'Ctrl/Cmd+R' },
  { action: 'toggleSidebar', label: 'Toggle sidebar', keys: 'Ctrl/Cmd+B' },
  { action: 'toggleSettings', label: 'Open settings', keys: 'Ctrl/Cmd+,' },
  { action: 'nextSearchMatch', label: 'Next search match', keys: 'Enter' },
  { action: 'previousSearchMatch', label: 'Previous search match', keys: 'Shift+Enter' },
];

export const getShortcutLabel = (action: ShortcutAction): string => {
  return SHORTCUTS.find((shortcut) => shortcut.action === action)?.keys ?? '';
};

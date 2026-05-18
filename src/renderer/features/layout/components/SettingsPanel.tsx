import {
  Maximize2,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Sun,
  X,
} from 'lucide-react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { useFileMonitorStore, type ThemeMode } from '@renderer/stores/fileMonitorStore';

import type { ReactNode } from 'react';
import type { JSX } from 'react';

export const SettingsPanel = (): JSX.Element | null => {
  const isSettingsOpen = useFileMonitorStore((state) => state.isSettingsOpen);
  const themeMode = useFileMonitorStore((state) => state.themeMode);
  const isSidebarVisible = useFileMonitorStore((state) => state.isSidebarVisible);
  const isExplorerVisible = useFileMonitorStore((state) => state.isExplorerVisible);
  const isLogViewerExpanded = useFileMonitorStore((state) => state.isLogViewerExpanded);
  const preferences = useFileMonitorStore((state) => state.preferences);
  const setThemeMode = useFileMonitorStore((state) => state.setThemeMode);
  const closeSettingsPanel = useFileMonitorStore((state) => state.closeSettingsPanel);
  const toggleSidebarVisibility = useFileMonitorStore((state) => state.toggleSidebarVisibility);
  const toggleExplorerVisibility = useFileMonitorStore((state) => state.toggleExplorerVisibility);
  const toggleLogViewerExpanded = useFileMonitorStore((state) => state.toggleLogViewerExpanded);
  const toggleAutoScroll = useFileMonitorStore((state) => state.toggleAutoScroll);
  const toggleLineWrap = useFileMonitorStore((state) => state.toggleLineWrap);
  const toggleLineNumbers = useFileMonitorStore((state) => state.toggleLineNumbers);
  const toggleFilterToMatches = useFileMonitorStore((state) => state.toggleFilterToMatches);
  const resetLogFilters = useFileMonitorStore((state) => state.resetLogFilters);
  const reloadApplicationWindow = useFileMonitorStore((state) => state.reloadApplicationWindow);

  if (!isSettingsOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-ink-950/40 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close settings"
        onClick={closeSettingsPanel}
      />

      <aside className="relative z-10 flex h-full w-[390px] flex-col border-l border-line bg-panel shadow-panel">
        <header className="flex h-16 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-ink-850 text-accent">
              <Settings size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-readable">Settings</h2>
              <p className="text-xs text-muted">Viewer, theme, and workspace controls</p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={closeSettingsPanel} aria-label="Close">
            <X size={15} />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
          <SettingsSection title="Appearance" description="Default mode is light.">
            <div className="grid grid-cols-2 gap-2">
              <ThemeButton
                label="Light"
                mode="light"
                activeMode={themeMode}
                onSelect={setThemeMode}
              />
              <ThemeButton
                label="Dark"
                mode="dark"
                activeMode={themeMode}
                onSelect={setThemeMode}
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Workspace Layout" description="Hide panels when logs need space.">
            <SettingRow
              title="Sidebar"
              description="Source actions and watched files"
              active={isSidebarVisible}
              onToggle={toggleSidebarVisibility}
              icon={isSidebarVisible ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            />
            <SettingRow
              title="File explorer"
              description="Directory tree and file list"
              active={isExplorerVisible}
              onToggle={toggleExplorerVisibility}
              icon={isExplorerVisible ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            />
            <SettingRow
              title="Focused log viewer"
              description="Hide all panels and use the full window"
              active={isLogViewerExpanded}
              onToggle={toggleLogViewerExpanded}
              icon={isLogViewerExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            />
          </SettingsSection>

          <SettingsSection
            title="Viewer Defaults"
            description="Controls are also available above logs."
          >
            <SettingRow
              title="Auto-scroll"
              description="Follow appended log updates"
              active={preferences.autoScroll}
              onToggle={toggleAutoScroll}
            />
            <SettingRow
              title="Line wrapping"
              description="Wrap long log lines inside the viewport"
              active={preferences.lineWrap}
              onToggle={toggleLineWrap}
            />
            <SettingRow
              title="Line numbers"
              description="Show stable line numbers beside log entries"
              active={preferences.showLineNumbers}
              onToggle={toggleLineNumbers}
            />
            <SettingRow
              title="Filter to matches"
              description="Only show rows that match search text"
              active={preferences.filterToMatches}
              onToggle={toggleFilterToMatches}
            />
          </SettingsSection>

          <SettingsSection title="Window" description="Safe application-level actions.">
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                void reloadApplicationWindow();
              }}
            >
              <RefreshCw size={15} />
              Reload Window
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={resetLogFilters}>
              Reset search and severity filters
            </Button>
          </SettingsSection>
        </div>
      </aside>
    </div>
  );
};

interface SettingsSectionProps {
  title: string;
  description: string;
  children: ReactNode;
}

const SettingsSection = ({ title, description, children }: SettingsSectionProps): JSX.Element => {
  return (
    <section className="rounded-xl border border-line bg-ink-950/40 p-4">
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-readable">{title}</h3>
          <Badge>{title === 'Appearance' ? 'UI' : 'Config'}</Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
};

interface ThemeButtonProps {
  label: string;
  mode: ThemeMode;
  activeMode: ThemeMode;
  onSelect: (themeMode: ThemeMode) => void;
}

const ThemeButton = ({ label, mode, activeMode, onSelect }: ThemeButtonProps): JSX.Element => {
  const isActive = mode === activeMode;

  return (
    <button
      type="button"
      className={[
        'flex h-20 flex-col items-center justify-center gap-2 rounded-lg border text-sm transition',
        isActive
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-ink-900 text-muted hover:border-line-strong hover:text-readable',
      ].join(' ')}
      onClick={() => {
        onSelect(mode);
      }}
    >
      {mode === 'light' ? <Sun size={18} /> : <Moon size={18} />}
      {label}
    </button>
  );
};

interface SettingRowProps {
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  icon?: JSX.Element;
}

const SettingRow = ({
  title,
  description,
  active,
  onToggle,
  icon,
}: SettingRowProps): JSX.Element => {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-ink-900 px-3 py-3 text-left transition hover:border-line-strong"
      onClick={onToggle}
    >
      <span className="flex min-w-0 items-center gap-3">
        {icon && <span className="text-muted">{icon}</span>}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-readable">{title}</span>
          <span className="block truncate text-xs text-muted">{description}</span>
        </span>
      </span>
      <span
        className={[
          'flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition',
          active
            ? 'justify-end border-success/50 bg-success-soft'
            : 'justify-start border-line bg-ink-800',
        ].join(' ')}
      >
        <span
          className={['h-4 w-4 rounded-full transition', active ? 'bg-success' : 'bg-subtle'].join(
            ' ',
          )}
        />
      </span>
    </button>
  );
};

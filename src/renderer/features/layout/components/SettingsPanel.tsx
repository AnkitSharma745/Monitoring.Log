import {
  ChevronLeft,
  Database,
  Eye,
  Keyboard,
  LayoutPanelLeft,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type JSX, type ReactNode } from 'react';

import { Button } from '@renderer/components/ui/Button';
import { SHORTCUTS } from '@renderer/features/shortcuts/shortcutDefinitions';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useSettingsStore, type DensityMode } from '@renderer/stores/settingsStore';

type AdvancedSettingsSection =
  | 'general'
  | 'viewer'
  | 'visibility'
  | 'filters'
  | 'workspace'
  | 'shortcuts';
type ThemeMode = 'light' | 'dark';

interface SettingRowCompactProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

const SettingRowCompact = ({ label, active, onToggle }: SettingRowCompactProps): JSX.Element => {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between py-0.5 text-left text-xs transition hover:text-readable text-muted outline-none"
      onClick={onToggle}
    >
      <span>{label}</span>
      <span
        className={[
          'flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 transition',
          active
            ? 'justify-end border-success/50 bg-success-soft'
            : 'justify-start border-line bg-ink-800',
        ].join(' ')}
      >
        <span
          className={[
            'h-2.5 w-2.5 rounded-full transition',
            active ? 'bg-success' : 'bg-subtle',
          ].join(' ')}
        />
      </span>
    </button>
  );
};

export const SettingsPanel = (): JSX.Element | null => {
  const isSettingsOpen = useSettingsStore((state) => state.isSettingsOpen);
  const closeSettingsPanel = useSettingsStore((state) => state.closeSettingsPanel);
  const openAdvancedSettings = useSettingsStore((state) => state.openAdvancedSettings);
  const themeMode = useSettingsStore((state) => state.theme);
  const setThemeMode = useSettingsStore((state) => state.setTheme);
  const density = useSettingsStore((state) => state.density);
  const setDensity = useSettingsStore((state) => state.setDensity);

  const isSidebarVisible = useFileMonitorStore((state) => state.isSidebarVisible);
  const isExplorerVisible = useFileMonitorStore((state) => state.isExplorerVisible);
  const isLogViewerExpanded = useFileMonitorStore((state) => state.isLogViewerExpanded);
  const preferences = useFileMonitorStore((state) => state.preferences);

  const toggleSidebarVisibility = useFileMonitorStore((state) => state.toggleSidebarVisibility);
  const toggleExplorerVisibility = useFileMonitorStore((state) => state.toggleExplorerVisibility);
  const toggleLogViewerExpanded = useFileMonitorStore((state) => state.toggleLogViewerExpanded);
  const toggleAutoScroll = useFileMonitorStore((state) => state.toggleAutoScroll);
  const toggleLineWrap = useFileMonitorStore((state) => state.toggleLineWrap);
  const toggleLineNumbers = useFileMonitorStore((state) => state.toggleLineNumbers);
  const toggleCompactMode = useFileMonitorStore((state) => state.toggleCompactMode);
  const toggleEnableHeuristicHints = useSettingsStore((state) => state.toggleEnableHeuristicHints);
  const toggleShowIngestionTrace = useSettingsStore((state) => state.toggleShowIngestionTrace);
  const setFeatureVisibility = useSettingsStore((state) => state.setFeatureVisibility);
  const featureVisibility = useSettingsStore((state) => state.preferences.featureVisibility);

  if (!isSettingsOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-transparent outline-none border-none"
        aria-label="Close settings"
        onClick={closeSettingsPanel}
      />
      <aside className="absolute bottom-10 left-14 z-50 flex w-72 flex-col gap-3 rounded-lg border border-line bg-panel p-3.5 shadow-panel animate-in fade-in slide-in-from-bottom-2 duration-150">
        <header className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-accent animate-spin-hover" />
            <div>
              <h2 className="text-xs font-semibold text-readable">Quick Settings</h2>
              <p className="text-[10px] text-muted font-normal">Common workspace preferences</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={closeSettingsPanel}
            aria-label="Close settings"
          >
            <X size={13} />
          </Button>
        </header>

        <div className="flex flex-col gap-2.5">
          <div>
            <span className="block text-[9px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Appearance
            </span>
            <div className="grid grid-cols-2 gap-1.5">
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
          </div>

          <div className="h-[1px] bg-line/60" />

          <div>
            <span className="block text-[9px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Density
            </span>
            <DensitySelector density={density} onSelect={setDensity} />
          </div>

          <div className="h-[1px] bg-line/60" />

          <div className="flex flex-col gap-2">
            <span className="block text-[9px] font-semibold text-muted uppercase tracking-wider">
              Feature Visibility
            </span>
            <SettingRowCompact
              label="Activity Rail"
              active={featureVisibility.activityRail}
              onToggle={() => setFeatureVisibility('activityRail', !featureVisibility.activityRail)}
            />
            <SettingRowCompact
              label="Timeline"
              active={featureVisibility.timeline}
              onToggle={() => setFeatureVisibility('timeline', !featureVisibility.timeline)}
            />
            <SettingRowCompact
              label="AI Evidence"
              active={featureVisibility.aiEvidence}
              onToggle={() => setFeatureVisibility('aiEvidence', !featureVisibility.aiEvidence)}
            />
            <SettingRowCompact
              label="Incidents"
              active={featureVisibility.incidents}
              onToggle={() => setFeatureVisibility('incidents', !featureVisibility.incidents)}
            />
            <SettingRowCompact
              label="Advanced Filters"
              active={featureVisibility.advancedFilters}
              onToggle={() =>
                setFeatureVisibility('advancedFilters', !featureVisibility.advancedFilters)
              }
            />
          </div>

          <div className="h-[1px] bg-line/60" />

          <div className="flex flex-col gap-2">
            <span className="block text-[9px] font-semibold text-muted uppercase tracking-wider">
              Workspace Panels
            </span>
            <SettingRowCompact
              label="Source Rail"
              active={isSidebarVisible}
              onToggle={toggleSidebarVisibility}
            />
            <SettingRowCompact
              label="File Explorer"
              active={isExplorerVisible}
              onToggle={toggleExplorerVisibility}
            />
            <SettingRowCompact
              label="Focus View"
              active={isLogViewerExpanded}
              onToggle={toggleLogViewerExpanded}
            />
          </div>

          <div className="h-[1px] bg-line/60" />

          <div className="flex flex-col gap-2">
            <span className="block text-[9px] font-semibold text-muted uppercase tracking-wider">
              Viewer Defaults
            </span>
            <SettingRowCompact
              label="Auto-scroll to Bottom"
              active={preferences.autoScroll}
              onToggle={toggleAutoScroll}
            />
            <SettingRowCompact
              label="Line Wrapping"
              active={preferences.lineWrap}
              onToggle={toggleLineWrap}
            />
            <SettingRowCompact
              label="Line Numbers"
              active={preferences.showLineNumbers}
              onToggle={toggleLineNumbers}
            />
            <SettingRowCompact
              label="Compact Mode"
              active={preferences.compactMode}
              onToggle={toggleCompactMode}
            />
          </div>

          <div className="h-[1px] bg-line/60" />

          <div className="flex flex-col gap-2">
            <span className="block text-[9px] font-semibold text-muted uppercase tracking-wider">
              Evidence Intelligence
            </span>
            <SettingRowCompact
              label="Enable Heuristic Hints"
              active={!!preferences.enableHeuristicHints}
              onToggle={toggleEnableHeuristicHints}
            />
            <SettingRowCompact
              label="Show Ingestion Trace"
              active={!!preferences.showIngestionTrace}
              onToggle={toggleShowIngestionTrace}
            />
          </div>

          <div className="h-[1px] bg-line/60 mt-1" />

          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-between mt-1 text-xs h-8"
            onClick={openAdvancedSettings}
          >
            Advanced Settings...
            <ChevronLeft size={13} className="rotate-180 text-muted" />
          </Button>
        </div>
      </aside>
    </div>
  );
};

export const AdvancedSettingsPanel = (): JSX.Element => {
  const [activeSection, setActiveSection] = useState<AdvancedSettingsSection>('general');
  const [shortcutSearch, setShortcutSearch] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const preferences = useFileMonitorStore((state) => state.preferences);
  const recentSources = useFileMonitorStore((state) => state.recentSources);
  const searchHistory = useFileMonitorStore((state) => state.searchHistory);

  const closeAdvancedSettings = useSettingsStore((state) => state.closeAdvancedSettings);
  const density = useSettingsStore((state) => state.density);
  const setDensity = useSettingsStore((state) => state.setDensity);
  const featureVisibility = useSettingsStore((state) => state.preferences.featureVisibility);
  const setFeatureVisibility = useSettingsStore((state) => state.setFeatureVisibility);
  const toggleSidebarVisibility = useFileMonitorStore((state) => state.toggleSidebarVisibility);
  const toggleExplorerVisibility = useFileMonitorStore((state) => state.toggleExplorerVisibility);
  const toggleLogViewerExpanded = useFileMonitorStore((state) => state.toggleLogViewerExpanded);
  const toggleAutoScroll = useFileMonitorStore((state) => state.toggleAutoScroll);
  const toggleLineWrap = useFileMonitorStore((state) => state.toggleLineWrap);
  const toggleLineNumbers = useFileMonitorStore((state) => state.toggleLineNumbers);
  const toggleFilterToMatches = useFileMonitorStore((state) => state.toggleFilterToMatches);
  const toggleCompactMode = useFileMonitorStore((state) => state.toggleCompactMode);
  const toggleCollapseRepeatedLogs = useFileMonitorStore(
    (state) => state.toggleCollapseRepeatedLogs,
  );
  const resetLogFilters = useFileMonitorStore((state) => state.resetLogFilters);
  const clearWorkspaceHistory = useFileMonitorStore((state) => state.clearWorkspaceHistory);
  const exportWorkspacePreferences = useFileMonitorStore(
    (state) => state.exportWorkspacePreferences,
  );
  const importWorkspacePreferences = useFileMonitorStore(
    (state) => state.importWorkspacePreferences,
  );
  const reloadApplicationWindow = useFileMonitorStore((state) => state.reloadApplicationWindow);

  const filteredShortcuts = useMemo(() => {
    const query = shortcutSearch.trim().toLocaleLowerCase();
    if (!query) return SHORTCUTS;
    return SHORTCUTS.filter(
      (shortcut) =>
        shortcut.label.toLocaleLowerCase().includes(query) ||
        shortcut.keys.toLocaleLowerCase().includes(query),
    );
  }, [shortcutSearch]);

  const handleExportPreferences = async (): Promise<void> => {
    await navigator.clipboard.writeText(exportWorkspacePreferences());
  };

  const handleImportPreferences = async (file: File): Promise<void> => {
    const rawValue = await file.text();
    importWorkspacePreferences(rawValue);
  };

  return (
    <div className="flex-1 min-h-0 flex bg-ink-950 text-readable border-t border-line">
      {/* Left Sidebar */}
      <aside className="w-52 shrink-0 border-r border-line bg-panel/30 flex flex-col justify-between py-4">
        <div className="space-y-4">
          <div className="px-4 pb-2 border-b border-line/40">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Advanced settings
            </h2>
          </div>
          <nav className="px-2 space-y-1">
            {advancedSettingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={[
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition outline-none',
                  activeSection === section.id
                    ? 'bg-accent-soft text-readable font-semibold'
                    : 'text-muted hover:bg-ink-900 hover:text-readable',
                ].join(' ')}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon
                  size={14}
                  className={activeSection === section.id ? 'text-accent' : 'text-muted'}
                />
                {section.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="px-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs h-8"
            onClick={closeAdvancedSettings}
          >
            <ChevronLeft size={14} />
            Back to Workspace
          </Button>
        </div>
      </aside>

      {/* Main Settings Page content area */}
      <section className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-6">
          {activeSection === 'general' && (
            <SettingsWorkspaceSection
              title="General"
              description="Application-level controls and runtime configuration."
            >
              <div className="flex flex-col gap-4">
                <p className="text-xs text-muted leading-relaxed">
                  Perform a hard reload of the desktop runtime system to flush memory pools and
                  reset process bindings.
                </p>
                <Button
                  variant="secondary"
                  className="w-44 justify-start text-xs h-8"
                  onClick={() => {
                    void reloadApplicationWindow();
                  }}
                >
                  <RefreshCw size={13} className="mr-2 animate-spin-hover" />
                  Reload Window
                </Button>
              </div>
            </SettingsWorkspaceSection>
          )}

          {activeSection === 'viewer' && (
            <SettingsWorkspaceSection
              title="Viewer Preferences"
              description="Reading defaults and virtualized console line structures."
            >
              <div className="grid gap-3">
                <SettingRow
                  title="Auto-scroll to bottom"
                  description="Follow live log lines instantly on file appends"
                  active={preferences.autoScroll}
                  onToggle={toggleAutoScroll}
                />
                <SettingRow
                  title="Line wrapping"
                  description="Wrap long statements within the editor boundary"
                  active={preferences.lineWrap}
                  onToggle={toggleLineWrap}
                />
                <SettingRow
                  title="Line numbers"
                  description="Display persistent index counts alongside each line"
                  active={preferences.showLineNumbers}
                  onToggle={toggleLineNumbers}
                />
                <SettingRow
                  title="Compact mode spacing"
                  description="Reclaim row heights for higher volume densities"
                  active={preferences.compactMode}
                  onToggle={toggleCompactMode}
                />
                <div className="rounded-md border border-line bg-panel px-3 py-2">
                  <div className="mb-2 text-xs font-semibold text-readable">Workspace density</div>
                  <DensitySelector density={density} onSelect={setDensity} />
                </div>
                <SettingRow
                  title="Collapse consecutive duplicate rows"
                  description="Automatically identify and group repetitive warning bursts"
                  active={preferences.collapseRepeatedLogs}
                  onToggle={toggleCollapseRepeatedLogs}
                />
              </div>
            </SettingsWorkspaceSection>
          )}

          {activeSection === 'visibility' && (
            <SettingsWorkspaceSection
              title="Feature Visibility"
              description="Personalize investigation density without changing core workflows."
            >
              <div className="grid gap-4">
                <VisibilityGroup title="Core Viewer">
                  <SettingRow
                    title="Metadata badges"
                    description="Show file size, line count, severity, and modified-time indicators"
                    active={featureVisibility.metadata}
                    onToggle={() => setFeatureVisibility('metadata', !featureVisibility.metadata)}
                  />
                  <SettingRow
                    title="Timestamps"
                    description="Show timestamp/source columns in log rows"
                    active={featureVisibility.timestamps}
                    onToggle={() =>
                      setFeatureVisibility('timestamps', !featureVisibility.timestamps)
                    }
                  />
                  <SettingRow
                    title="Advanced filter controls"
                    description="Show include/exclude filters and secondary filter toolbar actions"
                    active={featureVisibility.advancedFilters}
                    onToggle={() =>
                      setFeatureVisibility('advancedFilters', !featureVisibility.advancedFilters)
                    }
                  />
                </VisibilityGroup>

                <VisibilityGroup title="Investigation">
                  <SettingRow
                    title="Bookmarks"
                    description="Show evidence bookmark affordances in log rows"
                    active={featureVisibility.bookmarks}
                    onToggle={() => setFeatureVisibility('bookmarks', !featureVisibility.bookmarks)}
                  />
                  <SettingRow
                    title="Incidents"
                    description="Show incident-oriented navigation surfaces"
                    active={featureVisibility.incidents}
                    onToggle={() => setFeatureVisibility('incidents', !featureVisibility.incidents)}
                  />
                  <SettingRow
                    title="Timeline"
                    description="Show timeline panels and activity-bar entry"
                    active={featureVisibility.timeline}
                    onToggle={() => setFeatureVisibility('timeline', !featureVisibility.timeline)}
                  />
                  <SettingRow
                    title="Knowledge base"
                    description="Show knowledge and playbook investigation surfaces"
                    active={featureVisibility.knowledge}
                    onToggle={() => setFeatureVisibility('knowledge', !featureVisibility.knowledge)}
                  />
                </VisibilityGroup>

                <VisibilityGroup title="Advanced">
                  <SettingRow
                    title="Activity rail"
                    description="Show the full side activity rail; core Explorer and Search remain available"
                    active={featureVisibility.activityRail}
                    onToggle={() =>
                      setFeatureVisibility('activityRail', !featureVisibility.activityRail)
                    }
                  />
                  <SettingRow
                    title="Bottom panel"
                    description="Allow secondary panels below the viewer"
                    active={featureVisibility.bottomPanel}
                    onToggle={() =>
                      setFeatureVisibility('bottomPanel', !featureVisibility.bottomPanel)
                    }
                  />
                  <SettingRow
                    title="Watchers"
                    description="Show live watcher surfaces and activity entry"
                    active={featureVisibility.watchers}
                    onToggle={() => setFeatureVisibility('watchers', !featureVisibility.watchers)}
                  />
                  <SettingRow
                    title="Diagnostics and telemetry"
                    description="Show diagnostics, performance, and operational telemetry panels"
                    active={featureVisibility.diagnostics && featureVisibility.telemetry}
                    onToggle={() => {
                      const next = !(featureVisibility.diagnostics && featureVisibility.telemetry);
                      setFeatureVisibility('diagnostics', next);
                      setFeatureVisibility('telemetry', next);
                    }}
                  />
                  <SettingRow
                    title="AI assistance"
                    description="Show AI evidence assistance surfaces when available"
                    active={featureVisibility.aiEvidence}
                    onToggle={() =>
                      setFeatureVisibility('aiEvidence', !featureVisibility.aiEvidence)
                    }
                  />
                </VisibilityGroup>
              </div>
            </SettingsWorkspaceSection>
          )}

          {activeSection === 'filters' && (
            <SettingsWorkspaceSection
              title="Default Filters & Index Rules"
              description="Customize viewport match requirements and clear custom severe masks."
            >
              <div className="space-y-4">
                <SettingRow
                  title="Filter to matching entries"
                  description="Hide all lines that do not match the active search filter query"
                  active={preferences.filterToMatches}
                  onToggle={toggleFilterToMatches}
                />
                <div className="h-[1px] bg-line my-2" />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-readable">Workspace Reset Actions</h4>
                  <Button
                    variant="danger"
                    className="w-52 justify-start text-xs h-8"
                    onClick={resetLogFilters}
                  >
                    <Trash2 size={13} className="mr-2" />
                    Reset All Log Filters
                  </Button>
                </div>
              </div>
            </SettingsWorkspaceSection>
          )}

          {activeSection === 'workspace' && (
            <SettingsWorkspaceSection
              title="Workspace Config"
              description="Sidepanel indicators, database sizes, and workspace synchronization."
            >
              <div className="space-y-4">
                <div className="grid gap-3">
                  <SettingRow
                    title="Source rail visibility"
                    description="Show the recent logs activity bar and watcher listings"
                    active={useFileMonitorStore.getState().isSidebarVisible}
                    onToggle={toggleSidebarVisibility}
                  />
                  <SettingRow
                    title="File explorer tree visibility"
                    description="Show or hide the workspace sidebar tree structure"
                    active={useFileMonitorStore.getState().isExplorerVisible}
                    onToggle={toggleExplorerVisibility}
                  />
                  <SettingRow
                    title="Full-screen log focus view"
                    description="Temporarily expand the viewport and cover side panels"
                    active={useFileMonitorStore.getState().isLogViewerExpanded}
                    onToggle={toggleLogViewerExpanded}
                  />
                </div>

                <div className="h-[1px] bg-line my-2" />

                <div className="grid grid-cols-2 gap-3">
                  <WorkspaceStat
                    label="Recent logs index count"
                    value={recentSources.length.toString()}
                  />
                  <WorkspaceStat
                    label="Saved search history"
                    value={searchHistory.length.toString()}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-semibold text-readable">Configuration JSON</h4>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void handleExportPreferences();
                      }}
                    >
                      <Database size={13} className="mr-2" />
                      Copy JSON to Clipboard
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => importInputRef.current?.click()}
                    >
                      <Upload size={13} className="mr-2" />
                      Import JSON File
                    </Button>
                  </div>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleImportPreferences(file);
                      }
                      event.currentTarget.value = '';
                    }}
                  />
                </div>

                <div className="h-[1px] bg-line my-2" />

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-readable">Dangerous Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-8"
                      onClick={clearWorkspaceHistory}
                    >
                      <Trash2 size={13} className="mr-2" />
                      Clear Workspace Index History
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        window.localStorage.removeItem('monitoring-log.workspace.v1');
                        window.localStorage.removeItem('monitoring-log.settings.v1');
                        window.location.reload();
                      }}
                    >
                      <RefreshCw size={13} className="mr-2" />
                      Repair Workspace / Reset Cache
                    </Button>
                  </div>
                </div>
              </div>
            </SettingsWorkspaceSection>
          )}

          {activeSection === 'shortcuts' && (
            <SettingsWorkspaceSection
              title="Keyboard Shortcut Registry"
              description="Command combinations mapped to application actions."
            >
              <div className="space-y-4">
                <label className="relative block">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
                  />
                  <input
                    value={shortcutSearch}
                    onChange={(event) => {
                      setShortcutSearch(event.target.value);
                    }}
                    placeholder="Search shortcuts"
                    className="h-8.5 w-full rounded-md border border-line bg-panel px-9 text-xs text-readable outline-none transition placeholder:text-subtle focus:border-accent"
                  />
                </label>
                <div className="grid gap-2 max-h-96 overflow-y-auto pr-1">
                  {filteredShortcuts.map((shortcut) => (
                    <div
                      key={shortcut.action}
                      className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2 text-xs"
                    >
                      <span className="text-readable font-medium">{shortcut.label}</span>
                      <kbd className="rounded border border-line bg-ink-950 px-2 py-0.5 font-mono text-[10px] text-muted">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                  {filteredShortcuts.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted">
                      No keyboard shortcuts match your search.
                    </div>
                  )}
                </div>
              </div>
            </SettingsWorkspaceSection>
          )}
        </div>
      </section>
    </div>
  );
};

const advancedSettingsSections: Array<{
  id: AdvancedSettingsSection;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'viewer', label: 'Viewer Defaults', icon: SlidersHorizontal },
  { id: 'visibility', label: 'Visibility', icon: Eye },
  { id: 'filters', label: 'Default Filters', icon: Search },
  { id: 'workspace', label: 'Workspace Config', icon: LayoutPanelLeft },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
];

interface SettingsWorkspaceSectionProps {
  title: string;
  description: string;
  children: ReactNode;
}

const SettingsWorkspaceSection = ({
  title,
  description,
  children,
}: SettingsWorkspaceSectionProps): JSX.Element => {
  return (
    <section className="rounded-lg border border-line bg-panel p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-readable">{title}</h3>
        <p className="mt-1 text-xs leading-normal text-muted font-normal">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
};

interface DensitySelectorProps {
  density: DensityMode;
  onSelect: (density: DensityMode) => void;
}

const densityOptions: Array<{ value: DensityMode; label: string }> = [
  { value: 'ultraCompact', label: 'Ultra' },
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Normal' },
];

const DensitySelector = ({ density, onSelect }: DensitySelectorProps): JSX.Element => {
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded border border-line bg-ink-950">
      {densityOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className={[
            'h-7 min-w-0 truncate border-r border-line px-1.5 text-[11px] font-semibold transition last:border-r-0',
            density === option.value
              ? 'bg-accent-soft text-accent'
              : 'text-muted hover:bg-ink-900 hover:text-readable',
          ].join(' ')}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

interface VisibilityGroupProps {
  title: string;
  children: ReactNode;
}

const VisibilityGroup = ({ title, children }: VisibilityGroupProps): JSX.Element => {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-subtle">{title}</h4>
      <div className="grid gap-2">{children}</div>
    </div>
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
        'flex h-12 flex-col items-center justify-center gap-1 rounded-md border text-xs transition outline-none cursor-pointer',
        isActive
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-panel text-muted hover:border-line-strong hover:text-readable',
      ].join(' ')}
      onClick={() => {
        onSelect(mode);
      }}
    >
      {mode === 'light' ? <Sun size={14} /> : <Moon size={14} />}
      {label}
    </button>
  );
};

interface SettingRowProps {
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}

const SettingRow = ({ title, description, active, onToggle }: SettingRowProps): JSX.Element => {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-panel px-3 py-2 text-left transition hover:border-line-strong outline-none"
      onClick={onToggle}
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-readable">{title}</span>
        <span className="block text-[11px] text-muted font-normal mt-0.5">{description}</span>
      </span>
      <span
        className={[
          'flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 transition',
          active
            ? 'justify-end border-success/50 bg-success-soft'
            : 'justify-start border-line bg-ink-800',
        ].join(' ')}
      >
        <span
          className={[
            'h-2.5 w-2.5 rounded-full transition',
            active ? 'bg-success' : 'bg-subtle',
          ].join(' ')}
        />
      </span>
    </button>
  );
};

interface WorkspaceStatProps {
  label: string;
  value: string;
}

const WorkspaceStat = ({ label, value }: WorkspaceStatProps): JSX.Element => {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <div className="text-xs font-bold text-readable">{value}</div>
      <div className="text-[10px] uppercase font-semibold text-subtle tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  );
};

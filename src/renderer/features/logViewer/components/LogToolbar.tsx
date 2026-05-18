import {
  Copy,
  FolderTree,
  Maximize2,
  Minimize2,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Square,
  Trash2,
  WrapText,
  Play,
} from 'lucide-react';

import { Button } from '@renderer/components/ui/Button';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

import type { LogSeverity, LogSeverityStats } from '../logParsing';
import type { JSX } from 'react';

interface LogToolbarProps {
  visibleText: string;
  isBusy: boolean;
  activeFilePath: string | null;
  stats: LogSeverityStats;
}

const severityLabels: Array<{ severity: LogSeverity; label: string }> = [
  { severity: 'error', label: 'Error' },
  { severity: 'warn', label: 'Warn' },
  { severity: 'info', label: 'Info' },
  { severity: 'debug', label: 'Debug' },
  { severity: 'neutral', label: 'Other' },
];

export const LogToolbar = ({
  visibleText,
  isBusy,
  activeFilePath,
  stats,
}: LogToolbarProps): JSX.Element => {
  const searchQuery = useFileMonitorStore((state) => state.searchQuery);
  const preferences = useFileMonitorStore((state) => state.preferences);
  const setSearchQuery = useFileMonitorStore((state) => state.setSearchQuery);
  const loadFile = useFileMonitorStore((state) => state.loadFile);
  const startWatching = useFileMonitorStore((state) => state.startWatching);
  const stopWatching = useFileMonitorStore((state) => state.stopWatching);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const clearActiveView = useFileMonitorStore((state) => state.clearActiveView);
  const copyTextToClipboard = useFileMonitorStore((state) => state.copyTextToClipboard);
  const toggleAutoScroll = useFileMonitorStore((state) => state.toggleAutoScroll);
  const toggleLineWrap = useFileMonitorStore((state) => state.toggleLineWrap);
  const toggleLineNumbers = useFileMonitorStore((state) => state.toggleLineNumbers);
  const toggleFilterToMatches = useFileMonitorStore((state) => state.toggleFilterToMatches);
  const toggleSeverityFilter = useFileMonitorStore((state) => state.toggleSeverityFilter);
  const resetLogFilters = useFileMonitorStore((state) => state.resetLogFilters);
  const toggleSettingsPanel = useFileMonitorStore((state) => state.toggleSettingsPanel);
  const toggleSidebarVisibility = useFileMonitorStore((state) => state.toggleSidebarVisibility);
  const toggleExplorerVisibility = useFileMonitorStore((state) => state.toggleExplorerVisibility);
  const toggleLogViewerExpanded = useFileMonitorStore((state) => state.toggleLogViewerExpanded);
  const isLogViewerExpanded = useFileMonitorStore((state) => state.isLogViewerExpanded);
  const isSidebarVisible = useFileMonitorStore((state) => state.isSidebarVisible);
  const isExplorerVisible = useFileMonitorStore((state) => state.isExplorerVisible);
  const isWatching = activeFilePath ? Boolean(watchingFiles[activeFilePath]) : false;

  return (
    <div className="border-b border-line bg-ink-900/95 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search visible logs"
            className="h-9 w-full rounded-md border border-line bg-ink-950 px-9 text-sm text-readable outline-none transition placeholder:text-subtle focus:border-accent"
          />
        </div>

        <Button
          size="sm"
          variant={preferences.filterToMatches ? 'primary' : 'secondary'}
          onClick={toggleFilterToMatches}
        >
          Matches
        </Button>
        <Button size="sm" variant="ghost" onClick={resetLogFilters}>
          <RotateCcw size={14} />
          Reset
        </Button>
        <Button
          size="sm"
          variant={preferences.autoScroll ? 'success' : 'secondary'}
          onClick={toggleAutoScroll}
        >
          Auto
        </Button>
        <Button
          size="sm"
          variant={preferences.lineWrap ? 'success' : 'secondary'}
          onClick={toggleLineWrap}
        >
          <WrapText size={14} />
          Wrap
        </Button>
        <Button
          size="sm"
          variant={preferences.showLineNumbers ? 'success' : 'secondary'}
          onClick={toggleLineNumbers}
        >
          Lines
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {severityLabels.map(({ severity, label }) => (
            <SeverityFilterButton
              key={severity}
              label={label}
              severity={severity}
              count={stats[severity]}
              isActive={preferences.severityFilters[severity]}
              onToggle={toggleSeverityFilter}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (activeFilePath) {
                void loadFile(activeFilePath);
              }
            }}
            disabled={!activeFilePath || isBusy}
          >
            <RefreshCw size={14} />
            Reload
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void copyTextToClipboard(visibleText);
            }}
          >
            <Copy size={14} />
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={clearActiveView} disabled={!activeFilePath}>
            <Trash2 size={14} />
            Clear
          </Button>
          <Button
            size="sm"
            variant={isWatching ? 'danger' : 'primary'}
            onClick={() => {
              if (!activeFilePath) {
                return;
              }

              if (isWatching) {
                void stopWatching(activeFilePath);
              } else {
                void startWatching(activeFilePath);
              }
            }}
            disabled={!activeFilePath || isBusy}
          >
            {isWatching ? <Square size={14} /> : <Play size={14} />}
            {isWatching ? 'Stop' : 'Watch'}
          </Button>
          <Button
            size="sm"
            variant={isSidebarVisible ? 'secondary' : 'ghost'}
            onClick={toggleSidebarVisibility}
          >
            <PanelLeft size={14} />
          </Button>
          <Button
            size="sm"
            variant={isExplorerVisible ? 'secondary' : 'ghost'}
            onClick={toggleExplorerVisibility}
          >
            <FolderTree size={14} />
          </Button>
          <Button size="sm" variant="secondary" onClick={toggleLogViewerExpanded}>
            {isLogViewerExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isLogViewerExpanded ? 'Exit Focus' : 'Focus'}
          </Button>
          <Button size="sm" variant="secondary" onClick={toggleSettingsPanel}>
            <Settings size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
};

interface SeverityFilterButtonProps {
  label: string;
  severity: LogSeverity;
  count: number;
  isActive: boolean;
  onToggle: (severity: LogSeverity) => void;
}

const severityButtonClasses: Record<LogSeverity, string> = {
  error: 'border-danger/50 text-danger',
  warn: 'border-warning/50 text-warning',
  info: 'border-info/50 text-info',
  debug: 'border-line-strong text-muted',
  neutral: 'border-line text-subtle',
};

const SeverityFilterButton = ({
  label,
  severity,
  count,
  isActive,
  onToggle,
}: SeverityFilterButtonProps): JSX.Element => {
  return (
    <button
      type="button"
      className={[
        'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition',
        isActive
          ? `${severityButtonClasses[severity]} bg-ink-950`
          : 'border-line bg-ink-800 text-subtle opacity-55',
      ].join(' ')}
      onClick={() => {
        onToggle(severity);
      }}
    >
      {label}
      <span className="rounded-full bg-ink-800 px-1.5 py-0.5 text-[10px]">{count}</span>
    </button>
  );
};

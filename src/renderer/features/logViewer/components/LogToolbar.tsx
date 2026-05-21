import { ArrowDown, ArrowUp, Copy, Download, RotateCcw, Search, WrapText, X } from 'lucide-react';
import { useEffect, useRef, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { Tooltip } from '@renderer/components/ui/Tooltip';
import { getShortcutLabel } from '@renderer/features/shortcuts/shortcutDefinitions';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

import type { LogSeverityStats } from '../logParsing';

interface LogToolbarProps {
  isBusy: boolean;
  activeFilePath: string;
  stats: LogSeverityStats;
  matchCount: number;
}

export const LogToolbar = ({
  isBusy,
  activeFilePath,
  stats,
  matchCount,
}: LogToolbarProps): JSX.Element => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchQuery = useFileMonitorStore((state) => state.searchQuery);
  const preferences = useFileMonitorStore((state) => state.preferences);
  const setSearchQuery = useFileMonitorStore((state) => state.setSearchQuery);
  const selectNextSearchMatch = useFileMonitorStore((state) => state.selectNextSearchMatch);
  const selectPreviousSearchMatch = useFileMonitorStore((state) => state.selectPreviousSearchMatch);
  const toggleFilterToMatches = useFileMonitorStore((state) => state.toggleFilterToMatches);
  const toggleLineWrap = useFileMonitorStore((state) => state.toggleLineWrap);
  const resetLogFilters = useFileMonitorStore((state) => state.resetLogFilters);
  const copyTextToClipboard = useFileMonitorStore((state) => state.copyTextToClipboard);
  const exportTextToFile = useFileMonitorStore((state) => state.exportTextToFile);
  const loadFile = useFileMonitorStore((state) => state.loadFile);

  const getVisibleText = async (): Promise<string> => {
    const workerClient = getEngineWorkerClient();
    try {
      const res = await workerClient.request({
        type: 'getVisibleWindow',
        requestId: `visibleText:${activeFilePath}:${Date.now()}`,
        sourceId: activeFilePath,
        startRow: 0,
        endRow: 1000000,
        severityFilters: preferences.severityFilters,
        searchQuery: searchQuery,
        filterToMatches: preferences.filterToMatches,
      });

      if (res.type === 'getVisibleWindow:done') {
        return res.window.entries.map((e) => e.raw).join('\n');
      }
    } catch (err) {
      console.error('Failed to get visible text from worker:', err);
    }
    return '';
  };

  useEffect(() => {
    const handleFocusSearch = (): void => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('monitoring-log:focus-search', handleFocusSearch);

    return () => {
      window.removeEventListener('monitoring-log:focus-search', handleFocusSearch);
    };
  }, []);

  return (
    <div className="flex h-9 min-w-0 items-center justify-between gap-2 border-b border-line bg-ink-900 px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <label className="relative min-w-[180px] max-w-xl flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search active log"
            className="h-7 w-full rounded border border-line bg-ink-950 px-8 text-xs text-readable outline-none placeholder:text-subtle focus:border-accent"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-readable"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery('');
              }}
            >
              <X size={13} />
            </button>
          )}
        </label>

        <Tooltip label="Previous match" shortcut={getShortcutLabel('previousSearchMatch')}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            disabled={matchCount === 0}
            onClick={selectPreviousSearchMatch}
          >
            <ArrowUp size={13} />
          </Button>
        </Tooltip>
        <Tooltip label="Next match" shortcut={getShortcutLabel('nextSearchMatch')}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            disabled={matchCount === 0}
            onClick={selectNextSearchMatch}
          >
            <ArrowDown size={13} />
          </Button>
        </Tooltip>
        <Badge tone={matchCount > 0 ? 'info' : 'neutral'} className="h-6">
          {matchCount} match
        </Badge>
        <Badge tone={stats.error > 0 ? 'danger' : 'neutral'} className="h-6">
          {stats.error} error
        </Badge>
        <Badge tone={stats.warn > 0 ? 'warning' : 'neutral'} className="h-6">
          {stats.warn} warn
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant={preferences.filterToMatches ? 'secondary' : 'ghost'}
          className="h-7"
          onClick={toggleFilterToMatches}
        >
          Matches
        </Button>
        <Tooltip label="Toggle line wrap">
          <Button
            size="sm"
            variant={preferences.lineWrap ? 'secondary' : 'ghost'}
            className="h-7 px-1.5"
            onClick={toggleLineWrap}
          >
            <WrapText size={13} />
          </Button>
        </Tooltip>
        <Tooltip label="Reload active file" shortcut={getShortcutLabel('reloadActive')}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            disabled={isBusy}
            onClick={() => {
              void loadFile(activeFilePath);
            }}
          >
            <RotateCcw size={13} />
          </Button>
        </Tooltip>
        <Tooltip label="Copy visible logs">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            disabled={isBusy}
            onClick={async () => {
              const text = await getVisibleText();
              void copyTextToClipboard(text);
            }}
          >
            <Copy size={13} />
          </Button>
        </Tooltip>
        <Tooltip label="Export visible logs">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            disabled={isBusy}
            onClick={async () => {
              const text = await getVisibleText();
              exportTextToFile(text, `${activeFilePath.split(/[\\/]/).at(-1) ?? 'log'}.txt`);
            }}
          >
            <Download size={13} />
          </Button>
        </Tooltip>
        <Button size="sm" variant="ghost" className="h-7" onClick={resetLogFilters}>
          Reset
        </Button>
      </div>
    </div>
  );
};

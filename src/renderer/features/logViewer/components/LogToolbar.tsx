import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  RotateCcw,
  Search,
  WrapText,
  X,
  Columns,
  Link2,
} from 'lucide-react';
import { useEffect, useRef, type JSX } from 'react';

import { Button } from '@renderer/components/ui/Button';
import { Tooltip } from '@renderer/components/ui/Tooltip';
import { getShortcutLabel } from '@renderer/features/shortcuts/shortcutDefinitions';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useSearchStore } from '@renderer/stores/searchStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useViewerStore } from '@renderer/stores/viewerStore';

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
  stats: _stats,
  matchCount,
}: LogToolbarProps): JSX.Element => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Search Query and Toggles from searchStore
  const searchQuery = useSearchStore((state) => state.searchQuery);
  const setSearchQuery = useSearchStore((state) => state.setSearchQuery);
  const isRegex = useSearchStore((state) => state.isRegex);
  const isCaseSensitive = useSearchStore((state) => state.isCaseSensitive);
  const isWholeWord = useSearchStore((state) => state.isWholeWord);
  const setSearchOptions = useSearchStore((state) => state.setSearchOptions);

  // Advanced filters from settingsStore
  const includeFilter = useSettingsStore((state) => state.preferences.includeFilter);
  const excludeFilter = useSettingsStore((state) => state.preferences.excludeFilter);
  const featureVisibility = useSettingsStore((state) => state.preferences.featureVisibility);
  const density = useSettingsStore((state) => state.density);
  const setIncludeFilter = useSettingsStore((state) => state.setIncludeFilter);
  const setExcludeFilter = useSettingsStore((state) => state.setExcludeFilter);

  // Split Workspace comparative bindings
  const isSplitActive = useViewerStore((state) => state.isSplitActive);
  const setSplitActive = useViewerStore((state) => state.setSplitActive);
  const isScrollSyncActive = useViewerStore((state) => state.isScrollSyncActive);
  const toggleScrollSync = useViewerStore((state) => state.toggleScrollSync);

  // Other preferences
  const preferences = useFileMonitorStore((state) => state.preferences);
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
        isRegex,
        isCaseSensitive,
        isWholeWord,
        includeFilter,
        excludeFilter,
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
    <div
      className={[
        'flex min-w-0 shrink-0 items-center justify-between gap-1.5 overflow-hidden border-b border-line bg-ink-900 px-2 font-mono',
        density === 'ultraCompact' ? 'h-8' : 'h-9',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {/* VS Code styled advanced search query bar */}
        <div className="relative flex min-w-32 flex-1 items-center sm:min-w-48 lg:max-w-sm">
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
            placeholder="Search active log..."
            className="h-7 w-full rounded border border-line bg-ink-950 pl-8 pr-16 text-[11px] text-readable outline-none placeholder:text-subtle focus:border-accent"
          />

          {/* Inline Toggles */}
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded border border-line/40 bg-ink-900 p-[1px]">
            <button
              onClick={() => setSearchOptions({ isCaseSensitive: !isCaseSensitive })}
              title="Match Case (Aa)"
              className={`flex h-4 w-4 items-center justify-center rounded font-mono text-[8px] font-bold transition ${
                isCaseSensitive
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : 'text-subtle hover:text-readable border border-transparent'
              }`}
            >
              Aa
            </button>
            <button
              onClick={() => setSearchOptions({ isWholeWord: !isWholeWord })}
              title="Match Whole Word (ab)"
              className={`flex h-4 w-4 items-center justify-center rounded font-mono text-[8px] font-bold transition ${
                isWholeWord
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : 'text-subtle hover:text-readable border border-transparent'
              }`}
            >
              ab
            </button>
            <button
              onClick={() => setSearchOptions({ isRegex: !isRegex })}
              title="Use Regular Expression (.*)"
              className={`flex h-4 w-4 items-center justify-center rounded font-mono text-[8px] font-bold transition ${
                isRegex
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : 'text-subtle hover:text-readable border border-transparent'
              }`}
            >
              .*
            </button>
            {searchQuery && (
              <button
                type="button"
                className="ml-0.5 flex h-4 w-4 items-center justify-center border-l border-line/30 pl-0.5 text-subtle transition hover:text-readable"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Include filter input */}
        <div
          className={[
            'relative hidden w-28 shrink-0 items-center',
            featureVisibility.advancedFilters ? 'md:flex' : '',
          ].join(' ')}
        >
          <input
            value={includeFilter}
            onChange={(e) => setIncludeFilter(e.target.value)}
            placeholder="+ Include (AND)"
            className="h-7 w-full rounded border border-line bg-ink-950 px-2 text-[10px] text-readable outline-none placeholder:text-subtle focus:border-accent font-mono"
            title="Inclusion rules (comma separated OR, space separated AND)"
          />
          {includeFilter && (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-subtle hover:text-readable"
              onClick={() => setIncludeFilter('')}
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Exclude filter input */}
        <div
          className={[
            'relative hidden w-28 shrink-0 items-center',
            featureVisibility.advancedFilters ? 'lg:flex' : '',
          ].join(' ')}
        >
          <input
            value={excludeFilter}
            onChange={(e) => setExcludeFilter(e.target.value)}
            placeholder="- Exclude (AND)"
            className="h-7 w-full rounded border border-line bg-ink-950 px-2 text-[10px] text-readable outline-none placeholder:text-subtle focus:border-accent font-mono"
            title="Exclusion rules (comma separated OR, space separated AND)"
          />
          {excludeFilter && (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-subtle hover:text-readable"
              onClick={() => setExcludeFilter('')}
            >
              <X size={10} />
            </button>
          )}
        </div>

        <Tooltip label="Previous match" shortcut={getShortcutLabel('previousSearchMatch')}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
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
            className="h-7 w-7 px-0"
            disabled={matchCount === 0}
            onClick={selectNextSearchMatch}
          >
            <ArrowDown size={13} />
          </Button>
        </Tooltip>
        {/* <Badge tone={matchCount > 0 ? 'info' : 'neutral'} className="h-6 shrink-0 text-[10px]">
          {matchCount} match
        </Badge>
        <Badge tone={stats.error > 0 ? 'danger' : 'neutral'} className="h-6 shrink-0 text-[10px]">
          {stats.error} err
        </Badge> */}
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden">
        {/* Split Screen Control Buttons */}
        <Tooltip label="Toggle Side-by-Side Comparison Split">
          <Button
            size="sm"
            variant={isSplitActive ? 'secondary' : 'ghost'}
            className="h-7 w-7 px-0"
            onClick={() => setSplitActive(!isSplitActive)}
          >
            <Columns size={13} />
          </Button>
        </Tooltip>

        {isSplitActive && (
          <Tooltip label="Synchronize Vertical Scrolling">
            <Button
              size="sm"
              variant={isScrollSyncActive ? 'secondary' : 'ghost'}
              className="h-7 w-7 px-0"
              onClick={toggleScrollSync}
            >
              <Link2 size={13} className={isScrollSyncActive ? 'text-accent' : ''} />
            </Button>
          </Tooltip>
        )}

        <Button
          size="sm"
          variant={preferences.filterToMatches ? 'secondary' : 'ghost'}
          className={[
            'hidden h-7 text-[10px]',
            featureVisibility.advancedFilters ? 'xl:inline-flex' : '',
          ].join(' ')}
          onClick={toggleFilterToMatches}
        >
          MatchesOnly
        </Button>
        <Tooltip label="Toggle line wrap">
          <Button
            size="sm"
            variant={preferences.lineWrap ? 'secondary' : 'ghost'}
            className="h-7 w-7 px-0"
            onClick={toggleLineWrap}
          >
            <WrapText size={13} />
          </Button>
        </Tooltip>
        <Tooltip label="Reload active file" shortcut={getShortcutLabel('reloadActive')}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
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
            className="h-7 w-7 px-0"
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
            className="h-7 w-7 px-0"
            disabled={isBusy}
            onClick={async () => {
              const text = await getVisibleText();
              exportTextToFile(text, `${activeFilePath.split(/[\\/]/).at(-1) ?? 'log'}.txt`);
            }}
          >
            <Download size={13} />
          </Button>
        </Tooltip>
        <Button
          size="sm"
          variant="ghost"
          className={[
            'hidden h-7 text-[10px]',
            featureVisibility.advancedFilters ? 'xl:inline-flex' : '',
          ].join(' ')}
          onClick={resetLogFilters}
        >
          <span className="truncate">Reset</span>
        </Button>
      </div>
    </div>
  );
};

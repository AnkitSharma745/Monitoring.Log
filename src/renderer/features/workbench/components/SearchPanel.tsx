import {
  Search,
  History,
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
  BookmarkPlus,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useSearchStore } from '@renderer/stores/searchStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import { useWorkspaceStore } from '@renderer/stores/workspaceStore';
import type { SearchMatch } from '@shared/contracts/search';
import type React from 'react';

export const SearchPanel = (): React.JSX.Element => {
  const searchQuery = useSearchStore((state) => state.searchQuery);
  const setSearchQuery = useSearchStore((state) => state.setSearchQuery);
  const isRegex = useSearchStore((state) => state.isRegex);
  const isCaseSensitive = useSearchStore((state) => state.isCaseSensitive);
  const isWholeWord = useSearchStore((state) => state.isWholeWord);
  const setSearchOptions = useSearchStore((state) => state.setSearchOptions);
  const searchHistory = useSearchStore((state) => state.searchHistory);
  const savedFilters = useSearchStore((state) => state.savedFilters);
  const saveCurrentSearch = useSearchStore((state) => state.saveCurrentSearch);
  const saveCurrentFilter = useSearchStore((state) => state.saveCurrentFilter);
  const applySavedFilter = useSearchStore((state) => state.applySavedFilter);
  const clearSearchHistory = useSearchStore((state) => state.clearSearchHistory);
  const isSearching = useSearchStore((state) => state.isSearching);
  const setSearchRunning = useSearchStore((state) => state.setSearchRunning);
  const setSearchError = useSearchStore((state) => state.setSearchError);
  const searchError = useSearchStore((state) => state.searchError);
  const registerResult = useSearchStore((state) => state.registerResult);
  const lastSearchStatus = useSearchStore((state) => state.lastSearchStatus);

  const openTabs = useWorkspaceStore((state) => state.openTabs);
  const selectFile = useFileMonitorStore((state) => state.selectFile);
  const scrollToLineRowIndex = useViewerStore((state) => state.scrollToLineRowIndex);

  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  // Trigger workspace search when query or options or tabs change
  useEffect(() => {
    if (!searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearchRunning(false);
      return;
    }

    const sourceIds = openTabs.map((t) => t.filePath);
    if (sourceIds.length === 0) {
      setResults([]);
      setSearchRunning(false);
      return;
    }

    setSearchRunning(true);
    const workerClient = getEngineWorkerClient();
    const queryId = `search-panel-${Date.now()}`;
    const severityFilters = { error: true, warn: true, info: true, debug: true, neutral: true };
    let cancelled = false;

    const timer = setTimeout(() => {
      workerClient
        .request({
          type: 'search',
          requestId: queryId,
          query: {
            id: queryId,
            sourceIds,
            text: searchQuery,
            filterToMatches: false,
            severityFilters,
            timeRange: { start: null, end: null },
            limit: 1000,
            isRegex,
            isCaseSensitive,
            isWholeWord,
            maxDurationMs: 750,
          },
        })
        .then((res) => {
          if (cancelled) {
            return;
          }

          if (res.type === 'search:done' && res.result.queryId === queryId) {
            registerResult(res.result);
            setResults(res.result.matches);
            saveCurrentSearch();
          } else if (res.type === 'error') {
            setSearchError(res.message);
          }
        })
        .catch((err) => {
          if (cancelled) {
            return;
          }

          console.error('Workspace search failed:', err);
          setSearchError(err instanceof Error ? err.message : 'Workspace search failed.');
        })
        .finally(() => {
          if (!cancelled) {
            setSearchRunning(false);
          }
        });
    }, 150); // Debounce typing slightly

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    searchQuery,
    isRegex,
    isCaseSensitive,
    isWholeWord,
    openTabs,
    registerResult,
    saveCurrentSearch,
    setSearchError,
    setSearchRunning,
  ]);

  // Group matches by file
  const resultsByFile = useMemo(() => {
    const groups: Record<string, SearchMatch[]> = {};
    for (const match of results) {
      if (!match) continue;
      const key = match.sourceId || 'unknown';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key]!.push(match);
    }
    return groups;
  }, [results]);

  const toggleFileCollapse = (path: string): void => {
    setCollapsedFiles((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleMatchClick = async (match: SearchMatch): Promise<void> => {
    await selectFile(match.sourceId);
    // Give a brief moment for the tab to switch and virtualizer to register
    setTimeout(() => {
      scrollToLineRowIndex(match.lineNumber - 1);
    }, 60);
  };

  // Helper to extract file basename
  const getBasename = (path: string): string => {
    return path.substring(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  };

  // Safe highlighted rendering for search results preview
  const renderHighlightedSnippet = (
    text: string,
    ranges: SearchMatch['matchRanges'],
  ): React.JSX.Element => {
    if (!ranges || ranges.length === 0 || !text) {
      return <span className="text-[10px] font-mono text-subtle">{text || ''}</span>;
    }

    const elements: React.ReactNode[] = [];
    let lastIdx = 0;

    // Sort ranges by start column
    const sortedRanges = [...ranges].sort((a, b) => a.startColumn - b.startColumn);

    sortedRanges.forEach((range, idx) => {
      const start = Math.max(0, range.startColumn);
      const end = Math.min(text.length, range.endColumn);

      if (start > lastIdx) {
        elements.push(
          <span key={`text-${idx}`} className="text-subtle font-mono text-[10px]">
            {text.substring(lastIdx, start)}
          </span>,
        );
      }

      elements.push(
        <mark
          key={`highlight-${idx}`}
          className="bg-accent/40 text-accent font-bold font-mono text-[10px] px-[1px] rounded-[2px]"
        >
          {text.substring(start, end)}
        </mark>,
      );

      lastIdx = end;
    });

    if (lastIdx < text.length) {
      elements.push(
        <span key="text-end" className="text-subtle font-mono text-[10px]">
          {text.substring(lastIdx)}
        </span>,
      );
    }

    return <div className="truncate flex items-center gap-1 overflow-hidden">{elements}</div>;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel text-readable">
      {/* Search Header and Inputs */}
      <div className="border-b border-line p-2.5 space-y-2 bg-ink-950/60">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
            Workspace Search
          </span>
          <div className="relative">
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              title="Search History"
              className="p-1 hover:bg-ink-900 rounded border border-transparent hover:border-line text-subtle hover:text-readable transition"
            >
              <History size={13} />
            </button>
            {isHistoryOpen && (
              <div className="absolute right-0 top-6 z-50 w-52 rounded border border-line bg-ink-950 shadow-2xl p-1 text-[10px] space-y-0.5">
                <div className="flex justify-between items-center px-1.5 py-1 border-b border-line mb-1 text-subtle font-bold">
                  <span>RECENT SEARCHES</span>
                  <button
                    onClick={clearSearchHistory}
                    className="text-danger hover:text-danger-light"
                  >
                    Clear
                  </button>
                </div>
                {searchHistory.length === 0 ? (
                  <div className="p-2 text-subtle italic text-center">No history yet</div>
                ) : (
                  searchHistory.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSearchQuery(h);
                        setIsHistoryOpen(false);
                      }}
                      className="w-full text-left px-2 py-1 truncate rounded hover:bg-ink-900 text-subtle hover:text-readable transition font-mono"
                    >
                      {h}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across open logs..."
              className="h-7 w-full rounded border border-line bg-ink-900 pl-7 pr-1 text-[11px] text-readable placeholder-subtle outline-none focus:border-accent/60"
            />
          </div>

          {/* Toggle buttons row */}
          <div className="flex items-center border border-line bg-ink-900 rounded p-0.5 gap-0.5">
            <button
              onClick={() => setSearchOptions({ isCaseSensitive: !isCaseSensitive })}
              title="Match Case (Aa)"
              className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold transition font-mono ${
                isCaseSensitive
                  ? 'bg-accent/25 border border-accent/40 text-accent'
                  : 'text-subtle hover:text-readable border border-transparent'
              }`}
            >
              Aa
            </button>
            <button
              onClick={() => setSearchOptions({ isWholeWord: !isWholeWord })}
              title="Match Whole Word (ab)"
              className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold transition font-mono ${
                isWholeWord
                  ? 'bg-accent/25 border border-accent/40 text-accent'
                  : 'text-subtle hover:text-readable border border-transparent'
              }`}
            >
              ab
            </button>
            <button
              onClick={() => setSearchOptions({ isRegex: !isRegex })}
              title="Use Regular Expression (.*)"
              className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold transition font-mono ${
                isRegex
                  ? 'bg-accent/25 border border-accent/40 text-accent'
                  : 'text-subtle hover:text-readable border border-transparent'
              }`}
            >
              .*
            </button>
          </div>
          <button
            type="button"
            onClick={() => saveCurrentFilter()}
            title="Save current search and filters"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-ink-900 text-subtle transition hover:border-accent/40 hover:text-readable"
          >
            <BookmarkPlus size={13} />
          </button>
        </div>

        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {savedFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => applySavedFilter(filter.id)}
              className="h-6 max-w-32 shrink-0 truncate rounded border border-line bg-ink-900 px-2 font-mono text-[10px] text-muted transition hover:border-accent/40 hover:text-readable"
              title={filter.name}
            >
              {filter.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">
        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-10 text-subtle gap-2">
            <Loader2 size={16} className="animate-spin text-accent" />
            <span className="text-[10px]">Searching logs off-thread...</span>
          </div>
        ) : searchError ? (
          <div className="text-center text-danger text-[10px] py-10 px-3">{searchError}</div>
        ) : searchQuery && results.length === 0 ? (
          <div className="text-center text-subtle text-[10px] py-10">
            No matches found in open workspace files.
          </div>
        ) : !searchQuery ? (
          <div className="text-center text-subtle text-[10px] py-10 italic">
            Type a query to search logs.
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-[9px] text-subtle font-bold px-1 uppercase mb-2">
              Found {results.length} matches in {Object.keys(resultsByFile).length} files
              {lastSearchStatus === 'partial' ? ' (partial)' : ''}
            </div>

            {Object.entries(resultsByFile).map(([filePath, matches]) => {
              const basename = getBasename(filePath);
              const isCollapsed = collapsedFiles[filePath] ?? false;

              return (
                <div
                  key={filePath}
                  className="border border-line rounded bg-ink-950/20 overflow-hidden"
                >
                  {/* File Header */}
                  <div
                    onClick={() => toggleFileCollapse(filePath)}
                    className="flex items-center justify-between px-2 py-1.5 bg-ink-950 border-b border-line cursor-pointer select-none hover:bg-ink-900 transition"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText size={12} className="text-accent shrink-0" />
                      <span
                        className="text-[10px] font-bold truncate text-readable"
                        title={filePath}
                      >
                        {basename}
                      </span>
                      <span className="text-[9px] bg-ink-900 border border-line text-subtle px-1 rounded-full shrink-0">
                        {matches.length}
                      </span>
                    </div>
                    {isCollapsed ? (
                      <ChevronRight size={12} className="text-subtle" />
                    ) : (
                      <ChevronDown size={12} className="text-subtle" />
                    )}
                  </div>

                  {/* Matches List */}
                  {!isCollapsed && (
                    <div className="divide-y divide-line/40 max-h-56 overflow-y-auto">
                      {matches.map((match, idx) => (
                        <div
                          key={`${match.entryId}-${idx}`}
                          onClick={() => handleMatchClick(match)}
                          className="flex items-start gap-2 p-1.5 hover:bg-ink-900/60 cursor-pointer select-none transition group text-left"
                        >
                          <span className="text-[9px] text-subtle font-mono border border-line/30 rounded px-1 py-[0.5px] bg-ink-900 group-hover:text-accent group-hover:border-accent/40 shrink-0">
                            L{match.lineNumber}
                          </span>
                          <div className="flex-1 min-w-0 pr-1">
                            {renderHighlightedSnippet(match.raw || '', match.matchRanges)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;

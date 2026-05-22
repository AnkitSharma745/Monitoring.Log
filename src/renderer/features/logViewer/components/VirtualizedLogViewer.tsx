import { useEffect, useRef, useState, type JSX, forwardRef, useImperativeHandle } from 'react';

import { useSearchStore } from '@renderer/stores/searchStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useViewerStore } from '@renderer/stores/viewerStore';

import { LogLine } from './LogLine';
import type { LogEntry } from '../logParsing';

interface VirtualizedLogViewerProps {
  filePath: string;
}

export const VirtualizedLogViewer = forwardRef<HTMLDivElement, VirtualizedLogViewerProps>(
  ({ filePath }, ref): JSX.Element => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerHeight, setContainerHeight] = useState(500);
    const [scrollTop, setScrollTop] = useState(0);

    // Forward the container DOM element so AppLayout or LogViewer parent can coordinate scroll sync direct
    useImperativeHandle(ref, () => containerRef.current!);

    const viewportEntries = useViewerStore((state) => state.viewportEntries);
    const viewportTotalRows = useViewerStore((state) => state.viewportTotalRows);
    const viewportMatchedIndices = useViewerStore((state) => state.viewportMatchedIndices);
    const fetchViewportEntries = useViewerStore((state) => state.fetchViewportEntries);
    const setActiveWindow = useViewerStore((state) => state.setActiveWindow);

    // Details drawer selection
    const selectedLineEntry = useViewerStore((state) => state.selectedLineEntry);
    const setSelectedLineEntry = useViewerStore((state) => state.setSelectedLineEntry);

    const searchQuery = useSearchStore((state) => state.searchQuery);
    const isRegex = useSearchStore((state) => state.isRegex);
    const isCaseSensitive = useSearchStore((state) => state.isCaseSensitive);
    const isWholeWord = useSearchStore((state) => state.isWholeWord);

    const activeSearchMatchIndex = useSearchStore((state) => state.activeSearchMatchIndex);
    const preferences = useSettingsStore((state) => state.preferences);
    const {
      compactMode = false,
      severityFilters = {},
      filterToMatches = false,
      autoScroll = true,
      showLineNumbers = true,
      lineWrap = true,
      includeFilter = '',
      excludeFilter = '',
    } = preferences || {};

    const rowHeight = compactMode ? 20 : 28;
    const OVERSCAN = 10;

    // Track height of the scrolling container dynamically
    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const measure = (): void => {
        if (containerRef.current) {
          setContainerHeight(containerRef.current.clientHeight);
        }
      };

      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(containerRef.current);

      return () => observer.disconnect();
    }, []);

    const targetLineRowIndex = useViewerStore((state) => state.targetLineRowIndex);
    const scrollToLineRowIndex = useViewerStore((state) => state.scrollToLineRowIndex);

    // Focus and scroll to target line row index
    useEffect(() => {
      if (targetLineRowIndex !== null && containerRef.current) {
        containerRef.current.scrollTop = Math.max(
          0,
          targetLineRowIndex * rowHeight - containerHeight / 2,
        );
        setScrollTop(containerRef.current.scrollTop);
        scrollToLineRowIndex(null); // Clear target to allow clicking the same line again
      }
    }, [targetLineRowIndex, containerHeight, rowHeight, scrollToLineRowIndex]);

    // Calculate virtual row boundary bounds
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const endRow = Math.min(
      Math.max(0, viewportTotalRows - 1),
      Math.ceil((scrollTop + containerHeight) / rowHeight) + OVERSCAN,
    );

    // Sync virtual scrolling bounds with store
    useEffect(() => {
      setActiveWindow({ sourceId: filePath, startRow, endRow });
    }, [filePath, startRow, endRow, setActiveWindow]);

    // Fetch viewport log rows from the worker off-thread
    useEffect(() => {
      void fetchViewportEntries(filePath, startRow, endRow);
    }, [
      filePath,
      startRow,
      endRow,
      searchQuery,
      isRegex,
      isCaseSensitive,
      isWholeWord,
      includeFilter,
      excludeFilter,
      severityFilters,
      filterToMatches,
      fetchViewportEntries,
      viewportTotalRows, // trigger reload on file appends
    ]);

    // Auto-scroll to bottom if active and total row count increments
    useEffect(() => {
      if (!autoScroll || !containerRef.current) {
        return;
      }

      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }, [viewportTotalRows, autoScroll]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
      setScrollTop(e.currentTarget.scrollTop);
    };

    const totalHeight = viewportTotalRows * rowHeight;

    // Map each entry array to its virtual list slot height
    const renderedLines = (Array.isArray(viewportEntries) ? viewportEntries : []).map(
      (entry, index) => {
        if (!entry) return null;
        const virtualIndex = startRow + index;

        const isActiveMatch =
          !!searchQuery &&
          viewportMatchedIndices.length > 0 &&
          viewportMatchedIndices[activeSearchMatchIndex] === virtualIndex;

        const isDuplicateTimestamp =
          index > 0 &&
          !!entry.timestamp &&
          viewportEntries[index - 1]?.timestamp === entry.timestamp;

        const isSelected =
          selectedLineEntry?.id === entry.id ||
          (selectedLineEntry?.lineNumber === entry.lineNumber &&
            selectedLineEntry?.timestamp === entry.timestamp);

        return (
          <div
            key={entry.id ?? `empty-row-${index}`}
            style={{
              minHeight: rowHeight,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              width: '100%',
            }}
            onClick={() => setSelectedLineEntry(entry)}
          >
            <LogLine
              entry={entry as unknown as LogEntry}
              searchQuery={searchQuery}
              showLineNumbers={showLineNumbers}
              lineWrap={lineWrap}
              isActiveMatch={isActiveMatch}
              compactMode={compactMode}
              isDuplicateTimestamp={isDuplicateTimestamp}
              sourceId={filePath}
              isSelected={isSelected}
            />
          </div>
        );
      },
    );

    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`h-full w-full min-h-0 flex-1 overflow-y-auto bg-ink-950 relative ${
          lineWrap ? 'overflow-x-hidden' : 'overflow-x-auto'
        }`}
        style={{ contain: 'minimal' }}
      >
        <div
          style={{
            height: totalHeight,
            width: lineWrap ? '100%' : 'max-content',
            minWidth: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              transform: `translateY(${startRow * rowHeight}px)`,
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
            }}
          >
            {renderedLines}
          </div>
        </div>
        {viewportTotalRows === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-subtle font-mono">
            No lines match the current filter or search.
          </div>
        )}
      </div>
    );
  },
);

VirtualizedLogViewer.displayName = 'VirtualizedLogViewer';
export default VirtualizedLogViewer;

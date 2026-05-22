import { useEffect, useRef, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { formatBytes, formatDateTime } from '@renderer/features/files/fileFormatting';
import { AdvancedSettingsPanel } from '@renderer/features/layout/components/SettingsPanel';
import { OpenLogTabs } from '@renderer/features/tabs/components/OpenLogTabs';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import { LineFocusDrawer } from './LineFocusDrawer';
import { LogToolbar } from './LogToolbar';
import { VirtualizedLogViewer } from './VirtualizedLogViewer';

export const LogViewer = (): JSX.Element => {
  const isAdvancedSettingsOpen = useSettingsStore((state) => state.isAdvancedSettingsOpen);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const isBusy = useFileMonitorStore((state) => state.pendingOperations > 0);
  const stopWatching = useFileMonitorStore((state) => state.stopWatching);
  const startWatching = useFileMonitorStore((state) => state.startWatching);
  const openTabs = useFileMonitorStore((state) => state.openTabs);

  const selectedFile = selectedFilePath ? filesByPath[selectedFilePath] : null;
  const activeWatcher = selectedFilePath ? watchingFiles[selectedFilePath] : null;
  const isWatching = Boolean(activeWatcher);

  const rawStats = useViewerStore((state) => state.viewportSeverityStats);
  const matchCount = useViewerStore((state) => state.viewportMatchedCount);
  const totalRows = useViewerStore((state) => state.viewportTotalRows);
  const stats = {
    ...rawStats,
    visible: totalRows,
    matched: matchCount,
  };
  const viewerDoc = useViewerStore((state) =>
    selectedFilePath ? state.documentsByPath[selectedFilePath] : null,
  );
  const lineCount = viewerDoc?.lineCount ?? 0;
  const truncatedHead = viewerDoc?.truncatedHead ?? false;
  const trimmedInRenderer = viewerDoc?.trimmedInRenderer ?? false;

  // Split view states
  const isSplitActive = useViewerStore((state) => state.isSplitActive);
  const splitFilePath = useViewerStore((state) => state.splitFilePath);
  const selectSplitFile = useViewerStore((state) => state.selectSplitFile);
  const isScrollSyncActive = useViewerStore((state) => state.isScrollSyncActive);

  const leftViewerRef = useRef<HTMLDivElement | null>(null);
  const rightViewerRef = useRef<HTMLDivElement | null>(null);

  const restartActiveWatcher = async (): Promise<void> => {
    if (!selectedFilePath) {
      return;
    }

    await stopWatching(selectedFilePath);
    await startWatching(selectedFilePath);
  };

  // Sync scroll positions directly when isScrollSyncActive is enabled
  useEffect(() => {
    if (!isSplitActive || !isScrollSyncActive) return;

    const timer = setTimeout(() => {
      const left = leftViewerRef.current;
      const right = rightViewerRef.current;
      if (!left || !right) return;

      let isSyncingLeft = false;
      let isSyncingRight = false;

      const handleLeftScroll = () => {
        if (isSyncingRight) return;
        isSyncingLeft = true;
        right.scrollTop = left.scrollTop;
        right.scrollLeft = left.scrollLeft;
        setTimeout(() => {
          isSyncingLeft = false;
        }, 40);
      };

      const handleRightScroll = () => {
        if (isSyncingLeft) return;
        isSyncingRight = true;
        left.scrollTop = right.scrollTop;
        left.scrollLeft = right.scrollLeft;
        setTimeout(() => {
          isSyncingRight = false;
        }, 40);
      };

      left.addEventListener('scroll', handleLeftScroll, { passive: true });
      right.addEventListener('scroll', handleRightScroll, { passive: true });

      return () => {
        left.removeEventListener('scroll', handleLeftScroll);
        right.removeEventListener('scroll', handleRightScroll);
      };
    }, 120);

    return () => clearTimeout(timer);
  }, [isSplitActive, isScrollSyncActive, splitFilePath]);

  // Auto-default splitFilePath to another open tab if split layout is opened empty
  useEffect(() => {
    if (isSplitActive && !splitFilePath && selectedFilePath) {
      const otherTab = openTabs.find((t) => t.filePath !== selectedFilePath);
      if (otherTab) {
        selectSplitFile(otherTab.filePath);
      }
    }
  }, [isSplitActive, splitFilePath, openTabs, selectedFilePath, selectSplitFile]);

  if (isAdvancedSettingsOpen) {
    return (
      <section className="flex h-full w-full min-h-0 flex-1 flex-col bg-ink-950">
        <OpenLogTabs />
        <AdvancedSettingsPanel />
      </section>
    );
  }

  if (!selectedFile) {
    return (
      <section className="flex h-full w-full min-h-0 flex-1 flex-col bg-ink-950">
        <OpenLogTabs />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-ink-900 text-xl text-accent font-mono font-bold">
              ML
            </div>
            <h1 className="text-lg font-semibold text-readable">No log file selected</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Select or drop a .log or .txt source to start viewing content.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const splitFile = splitFilePath ? filesByPath[splitFilePath] : null;

  return (
    <section className="flex h-full w-full min-h-0 flex-1 flex-col bg-ink-950 relative overflow-hidden">
      <OpenLogTabs />

      {/* File Header Telemetry */}
      <header className="border-b border-line bg-panel px-4 py-2 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-readable font-mono">
                {selectedFile.name}
              </h1>
              <Badge className="font-mono text-[10px]">{formatBytes(selectedFile.sizeBytes)}</Badge>
              <Badge className="font-mono text-[10px]">Lines {lineCount}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[10px] text-muted font-mono" title={selectedFile.path}>
                {selectedFile.path}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs text-muted font-mono">
            {isWatching && (
              <Badge tone="success" className="text-[10px]">
                Live
              </Badge>
            )}
            {truncatedHead && (
              <Badge tone="warning" className="text-[10px]">
                Tail
              </Badge>
            )}
            {trimmedInRenderer && (
              <Badge tone="warning" className="text-[10px]">
                Trimmed
              </Badge>
            )}
            <Badge tone={stats.error > 0 ? 'danger' : 'neutral'} className="text-[10px]">
              {stats.error} error
            </Badge>
            <Badge tone={stats.warn > 0 ? 'warning' : 'neutral'} className="text-[10px]">
              {stats.warn} warn
            </Badge>
            {matchCount > 0 && (
              <Badge tone="info" className="text-[10px]">
                {matchCount} match
              </Badge>
            )}
            <Badge className="text-[10px]">
              Modified {formatDateTime(selectedFile.modifiedAt)}
            </Badge>
          </div>
        </div>
      </header>

      {activeWatcher?.lastErrorMessage && (
        <div className="flex items-center justify-between gap-3 border-b border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger font-mono shrink-0">
          <div className="min-w-0 truncate">
            <span className="font-semibold">Watcher error:</span> {activeWatcher.lastErrorMessage}
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              void restartActiveWatcher();
            }}
            disabled={isBusy}
          >
            Retry Watcher
          </Button>
        </div>
      )}

      {/* Main Action Toolbar */}
      <LogToolbar
        isBusy={isBusy}
        activeFilePath={selectedFile.path}
        stats={stats}
        matchCount={matchCount}
      />

      {/* Log Grids Area */}
      <div className="flex-1 flex min-h-0 divide-x divide-line relative">
        {/* Left Column Viewer (Main Workspace) */}
        <div className="flex-1 flex flex-col min-w-0 h-full relative">
          {isSplitActive && (
            <div className="h-5 shrink-0 bg-ink-900/80 border-b border-line flex items-center px-3 justify-between text-[9px] text-subtle font-mono font-bold select-none">
              <span className="text-accent uppercase">Main: {selectedFile.name}</span>
              <span>LEFT WORKSPACE</span>
            </div>
          )}
          <VirtualizedLogViewer filePath={selectedFile.path} ref={leftViewerRef} />
        </div>

        {/* Right Column Viewer (Comparative Split screen Workspace) */}
        {isSplitActive && (
          <div className="flex-1 flex flex-col min-w-0 h-full relative">
            <div className="h-5 shrink-0 bg-ink-900/80 border-b border-line flex items-center px-3 justify-between text-[9px] text-subtle font-mono font-bold select-none">
              <span className="text-accent uppercase">
                Compare: {splitFile ? splitFile.name : 'Select open target'}
              </span>

              <select
                value={splitFilePath || ''}
                onChange={(e) => selectSplitFile(e.target.value || null)}
                className="bg-ink-950 border border-line rounded px-1 text-[9px] text-readable focus:outline-none focus:border-accent"
              >
                <option value="">Select compare target...</option>
                {openTabs.map((t) => (
                  <option key={t.filePath} value={t.filePath}>
                    {t.filePath.split(/[\\/]/).at(-1) || t.filePath}
                  </option>
                ))}
              </select>
            </div>

            {splitFilePath ? (
              <VirtualizedLogViewer filePath={splitFilePath} ref={rightViewerRef} />
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center text-[11px] text-subtle font-mono bg-ink-950 select-none">
                Please select another open file from the dropdown above to begin side-by-side
                comparative analysis.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Structured Line Focus Drawer */}
      <LineFocusDrawer />
    </section>
  );
};

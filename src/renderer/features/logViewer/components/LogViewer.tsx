import { useEffect, useRef, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { formatBytes, formatDateTime } from '@renderer/features/files/fileFormatting';
import { AdvancedSettingsPanel } from '@renderer/features/layout/components/SettingsPanel';
import { OpenLogTabs } from '@renderer/features/tabs/components/OpenLogTabs';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { normalizePath } from '@renderer/stores/pathUtils';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import { LineFocusDrawer } from './LineFocusDrawer';
import { LogToolbar } from './LogToolbar';
import { VirtualizedLogViewer } from './VirtualizedLogViewer';

export const LogViewer = (): JSX.Element => {
  const isAdvancedSettingsOpen = useSettingsStore((state) => state.isAdvancedSettingsOpen);
  const density = useSettingsStore((state) => state.density);
  const featureVisibility = useSettingsStore((state) => state.preferences.featureVisibility);
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

  const rawStats = useViewerStore((state) =>
    selectedFilePath ? state.viewportSeverityStatsByPath[selectedFilePath] : null,
  ) ?? {
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    neutral: 0,
    total: 0,
  };
  const matchCount =
    useViewerStore((state) =>
      selectedFilePath ? state.viewportMatchedCountByPath[selectedFilePath] : 0,
    ) ?? 0;
  const totalRows =
    useViewerStore((state) =>
      selectedFilePath ? state.viewportTotalRowsByPath[selectedFilePath] : 0,
    ) ?? 0;
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
      const otherTab = openTabs.find(
        (t) => normalizePath(t.filePath) !== normalizePath(selectedFilePath),
      );
      if (otherTab) {
        void selectSplitFile(otherTab.filePath);
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

  if (selectedFilePath && !selectedFile) {
    return (
      <section className="flex h-full w-full min-h-0 flex-1 flex-col bg-ink-950">
        <OpenLogTabs />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 animate-spin flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent border-t-transparent" />
            <h1 className="text-sm font-semibold text-readable font-mono truncate max-w-xs">
              Loading {selectedFilePath.split(/[\\/]/).at(-1)}...
            </h1>
            <p className="mt-1 text-xs text-muted font-mono truncate max-w-xs">
              {selectedFilePath}
            </p>
          </div>
        </div>
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
      <header
        className={[
          'shrink-0 overflow-hidden border-b border-line bg-panel px-2.5',
          density === 'ultraCompact' ? 'py-1' : 'py-1.5',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              <h1 className="min-w-0 truncate font-mono text-sm font-semibold text-readable">
                {selectedFile.name}
              </h1>
              {featureVisibility.metadata && (
                <>
                  <Badge className="font-mono" maxWidthClassName="max-w-20">
                    {formatBytes(selectedFile.sizeBytes)}
                  </Badge>
                  <Badge className="font-mono" maxWidthClassName="max-w-24">
                    Lines {lineCount}
                  </Badge>
                </>
              )}
            </div>
          </div>
          {featureVisibility.metadata && (
            <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden font-mono text-xs text-muted">
              {isWatching && <Badge tone="success">Live</Badge>}
              {featureVisibility.advancedBadges && truncatedHead && (
                <Badge tone="warning">Tail</Badge>
              )}
              {featureVisibility.advancedBadges && trimmedInRenderer && (
                <Badge tone="warning">Trimmed</Badge>
              )}
              <Badge tone={stats.error > 0 ? 'danger' : 'neutral'} maxWidthClassName="max-w-20">
                {stats.error} error
              </Badge>
              <Badge tone={stats.warn > 0 ? 'warning' : 'neutral'} maxWidthClassName="max-w-20">
                {stats.warn} warn
              </Badge>
              {matchCount > 0 && (
                <Badge tone="info" maxWidthClassName="max-w-20">
                  {matchCount} match
                </Badge>
              )}
              {featureVisibility.advancedBadges && (
                <Badge className="hidden md:inline-flex" maxWidthClassName="max-w-48">
                  Modified {formatDateTime(selectedFile.modifiedAt)}
                </Badge>
              )}
            </div>
          )}
        </div>
      </header>

      {activeWatcher?.lastErrorMessage && (
        <div className="flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-danger/30 bg-danger-soft px-2.5 py-1.5 font-mono text-sm text-danger">
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
            <div className="flex h-5 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-line bg-ink-900/80 px-2 font-mono text-[9px] font-bold text-subtle select-none">
              <span className="min-w-0 truncate uppercase text-accent">
                Main: {selectedFile.name}
              </span>
              <span>LEFT WORKSPACE</span>
            </div>
          )}
          <VirtualizedLogViewer filePath={selectedFile.path} ref={leftViewerRef} />
        </div>

        {/* Right Column Viewer (Comparative Split screen Workspace) */}
        {isSplitActive && (
          <div className="flex-1 flex flex-col min-w-0 h-full relative">
            <div className="flex h-5 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-line bg-ink-900/80 px-2 font-mono text-[9px] font-bold text-subtle select-none">
              <span className="min-w-0 truncate uppercase text-accent">
                Compare: {splitFile ? splitFile.name : 'Select open target'}
              </span>

              <select
                value={splitFilePath || ''}
                onChange={(e) => void selectSplitFile(e.target.value || null)}
                className="h-4 max-w-40 shrink-0 rounded border border-line bg-ink-950 px-1 text-[9px] text-readable focus:border-accent focus:outline-none"
              >
                <option value="">Select compare target...</option>
                {openTabs
                  .filter((t) => normalizePath(t.filePath) !== normalizePath(selectedFilePath))
                  .map((t) => (
                    <option key={t.filePath} value={t.filePath}>
                      {t.filePath.split(/[\\/]/).at(-1) || t.filePath}
                    </option>
                  ))}
              </select>
            </div>

            {splitFilePath ? (
              <VirtualizedLogViewer filePath={splitFilePath} ref={rightViewerRef} />
            ) : (
              <div className="flex flex-1 items-center justify-center bg-ink-950 p-6 text-center font-mono text-[11px] text-subtle select-none">
                Select another open file to begin side-by-side comparative analysis.
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

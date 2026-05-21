import { type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { formatBytes, formatDateTime } from '@renderer/features/files/fileFormatting';
import { OpenLogTabs } from '@renderer/features/tabs/components/OpenLogTabs';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { AdvancedSettingsPanel } from '@renderer/features/layout/components/SettingsPanel';
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

  const restartActiveWatcher = async (): Promise<void> => {
    if (!selectedFilePath) {
      return;
    }

    await stopWatching(selectedFilePath);
    await startWatching(selectedFilePath);
  };

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
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-ink-900 text-xl text-accent">
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

  return (
    <section className="flex h-full w-full min-h-0 flex-1 flex-col bg-ink-950">
      <OpenLogTabs />
      <header className="border-b border-line bg-panel px-4 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-readable">{selectedFile.name}</h1>
              <Badge>{formatBytes(selectedFile.sizeBytes)}</Badge>
              <Badge>Lines {lineCount}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[11px] text-muted" title={selectedFile.path}>
                {selectedFile.path}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs text-muted">
            {isWatching && <Badge tone="success">Live</Badge>}
            {truncatedHead && <Badge tone="warning">Tail</Badge>}
            {trimmedInRenderer && <Badge tone="warning">Trimmed</Badge>}
            <Badge tone={stats.error > 0 ? 'danger' : 'neutral'}>{stats.error} error</Badge>
            <Badge tone={stats.warn > 0 ? 'warning' : 'neutral'}>{stats.warn} warn</Badge>
            {matchCount > 0 && <Badge tone="info">{matchCount} match</Badge>}
            <Badge>Modified {formatDateTime(selectedFile.modifiedAt)}</Badge>
          </div>
        </div>
      </header>

      {activeWatcher?.lastErrorMessage && (
        <div className="flex items-center justify-between gap-3 border-b border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
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

      <LogToolbar
        isBusy={isBusy}
        activeFilePath={selectedFile.path}
        stats={stats}
        matchCount={matchCount}
      />

      <VirtualizedLogViewer filePath={selectedFile.path} />
    </section>
  );
};

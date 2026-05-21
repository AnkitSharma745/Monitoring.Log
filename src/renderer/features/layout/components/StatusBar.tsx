import { FolderTree, Maximize2, Minimize2, PanelLeft, Settings } from 'lucide-react';
import { useMemo, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { Tooltip } from '@renderer/components/ui/Tooltip';
import { getWatcherHealth } from '@renderer/features/activity/watcherHealth';
import { formatBytes, formatShortTime } from '@renderer/features/files/fileFormatting';
import { getShortcutLabel } from '@renderer/features/shortcuts/shortcutDefinitions';
import { useCurrentTime } from '@renderer/hooks/useCurrentTime';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

export const StatusBar = (): JSX.Element => {
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const documentsByPath = useFileMonitorStore((state) => state.documentsByPath);
  const openTabs = useFileMonitorStore((state) => state.openTabs);
  const statusMessage = useFileMonitorStore((state) => state.statusMessage);
  const errorMessage = useFileMonitorStore((state) => state.errorMessage);
  const lastUpdate = useFileMonitorStore((state) => state.lastUpdate);
  const pendingOperations = useFileMonitorStore((state) => state.pendingOperations);
  const isSidebarVisible = useFileMonitorStore((state) => state.isSidebarVisible);
  const isExplorerVisible = useFileMonitorStore((state) => state.isExplorerVisible);
  const isLogViewerExpanded = useFileMonitorStore((state) => state.isLogViewerExpanded);
  const toggleSidebarVisibility = useFileMonitorStore((state) => state.toggleSidebarVisibility);
  const toggleExplorerVisibility = useFileMonitorStore((state) => state.toggleExplorerVisibility);
  const toggleLogViewerExpanded = useFileMonitorStore((state) => state.toggleLogViewerExpanded);
  const toggleSettingsPanel = useFileMonitorStore((state) => state.toggleSettingsPanel);
  const selectedFile = selectedFilePath ? filesByPath[selectedFilePath] : null;
  const selectedDocument = selectedFilePath ? documentsByPath[selectedFilePath] : null;
  const currentTime = useCurrentTime();
  const watcherHealthCounts = useMemo(() => {
    const counts = { stale: 0, error: 0 };

    for (const watcher of Object.values(watchingFiles)) {
      const health = getWatcherHealth(watcher, currentTime);

      if (health.tone === 'stale') {
        counts.stale += 1;
      }

      if (health.tone === 'error') {
        counts.error += 1;
      }
    }

    return counts;
  }, [currentTime, watchingFiles]);

  return (
    <footer className="col-[1/-1] flex h-[34px] min-w-0 items-center justify-between border-t border-line bg-ink-950 px-3 text-xs text-muted">
      <div className="flex min-w-0 items-center gap-2">
        <Badge tone={pendingOperations > 0 ? 'info' : 'neutral'}>
          {pendingOperations > 0 ? 'Working' : 'Ready'}
        </Badge>
        <Badge tone={Object.keys(watchingFiles).length > 0 ? 'success' : 'neutral'}>
          {Object.keys(watchingFiles).length} watcher(s)
        </Badge>
        <Badge>{openTabs.length} tab(s)</Badge>
        {(watcherHealthCounts.stale > 0 || watcherHealthCounts.error > 0) && (
          <Badge tone={watcherHealthCounts.error > 0 ? 'danger' : 'warning'}>
            {watcherHealthCounts.error} error / {watcherHealthCounts.stale} stale
          </Badge>
        )}
        {selectedFile && <span className="truncate">Selected: {selectedFile.name}</span>}
        {selectedFile && <span>{formatBytes(selectedFile.sizeBytes)}</span>}
        {selectedDocument && <span>{selectedDocument.lineCount} buffered line(s)</span>}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {lastUpdate && (
          <span className="truncate text-success">
            {lastUpdate.changeType} +{formatBytes(lastUpdate.bytesRead)} at{' '}
            {formatShortTime(lastUpdate.changedAt)}
          </span>
        )}
        {errorMessage ? (
          <span className="max-w-[42vw] truncate text-danger">{errorMessage}</span>
        ) : (
          statusMessage && <span className="max-w-[42vw] truncate">{statusMessage}</span>
        )}
        <Tooltip label="Toggle source rail" shortcut={getShortcutLabel('toggleSidebar')}>
          <Button
            size="sm"
            variant={isSidebarVisible ? 'ghost' : 'secondary'}
            onClick={toggleSidebarVisibility}
            aria-label="Toggle source rail"
          >
            <PanelLeft size={13} />
          </Button>
        </Tooltip>
        <Tooltip label="Toggle explorer">
          <Button
            size="sm"
            variant={isExplorerVisible ? 'ghost' : 'secondary'}
            onClick={toggleExplorerVisibility}
            aria-label="Toggle explorer"
          >
            <FolderTree size={13} />
          </Button>
        </Tooltip>
        <Tooltip label={isLogViewerExpanded ? 'Exit focus view' : 'Enter focus view'}>
          <Button
            size="sm"
            variant={isLogViewerExpanded ? 'secondary' : 'ghost'}
            onClick={toggleLogViewerExpanded}
            aria-label={isLogViewerExpanded ? 'Exit focus view' : 'Enter focus view'}
          >
            {isLogViewerExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </Button>
        </Tooltip>
        <Tooltip label="Open settings" shortcut={getShortcutLabel('toggleSettings')}>
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleSettingsPanel}
            aria-label="Open settings"
          >
            <Settings size={13} />
          </Button>
        </Tooltip>
      </div>
    </footer>
  );
};

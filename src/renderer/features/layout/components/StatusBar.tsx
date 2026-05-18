import { Badge } from '@renderer/components/ui/Badge';
import { formatBytes, formatShortTime } from '@renderer/features/files/fileFormatting';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

import type { JSX } from 'react';

export const StatusBar = (): JSX.Element => {
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const statusMessage = useFileMonitorStore((state) => state.statusMessage);
  const errorMessage = useFileMonitorStore((state) => state.errorMessage);
  const lastUpdate = useFileMonitorStore((state) => state.lastUpdate);
  const pendingOperations = useFileMonitorStore((state) => state.pendingOperations);
  const selectedFile = selectedFilePath ? filesByPath[selectedFilePath] : null;

  return (
    <footer className="col-[1/-1] flex h-[34px] min-w-0 items-center justify-between border-t border-line bg-ink-950 px-3 text-xs text-muted">
      <div className="flex min-w-0 items-center gap-2">
        <Badge tone={pendingOperations > 0 ? 'info' : 'neutral'}>
          {pendingOperations > 0 ? 'Working' : 'Ready'}
        </Badge>
        <Badge tone={Object.keys(watchingFiles).length > 0 ? 'success' : 'neutral'}>
          {Object.keys(watchingFiles).length} watcher(s)
        </Badge>
        {selectedFile && <span className="truncate">Selected: {selectedFile.name}</span>}
        {selectedFile && <span>{formatBytes(selectedFile.sizeBytes)}</span>}
      </div>

      <div className="flex min-w-0 items-center gap-3">
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
      </div>
    </footer>
  );
};

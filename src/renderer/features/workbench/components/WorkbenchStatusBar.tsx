import { AlertTriangle, Database, RadioTower, Zap } from 'lucide-react';
import { useMemo, type JSX, type ReactNode } from 'react';

import { formatBytes, formatShortTime } from '@renderer/features/files/fileFormatting';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';

export const WorkbenchStatusBar = (): JSX.Element => {
  const density = useSettingsStore((state) => state.density);
  const featureVisibility = useSettingsStore((state) => state.preferences.featureVisibility);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const documentsByPath = useFileMonitorStore((state) => state.documentsByPath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const openTabs = useFileMonitorStore((state) => state.openTabs);
  const lastUpdate = useFileMonitorStore((state) => state.lastUpdate);
  const statusMessage = useFileMonitorStore((state) => state.statusMessage);
  const errorMessage = useFileMonitorStore((state) => state.errorMessage);
  const selectedFile = selectedFilePath ? filesByPath[selectedFilePath] : null;
  const selectedDocument = selectedFilePath ? documentsByPath[selectedFilePath] : null;
  const bufferedBytes = useMemo(
    () =>
      Object.values(documentsByPath).reduce(
        (total, document) => total + document.content.length,
        0,
      ),
    [documentsByPath],
  );

  return (
    <footer
      className={[
        'col-[1/-1] flex min-w-0 items-center justify-between border-t border-line bg-panel text-[11px] text-muted select-none',
        density === 'ultraCompact' ? 'h-5' : 'h-6',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center">
        <StatusSegment icon={<RadioTower size={12} />}>
          {Object.keys(watchingFiles).length} live
        </StatusSegment>
        <StatusSegment>{openTabs.length} tabs</StatusSegment>
        {selectedFile && <StatusSegment>{selectedFile.name}</StatusSegment>}
        {selectedDocument && <StatusSegment>{selectedDocument.lineCount} lines</StatusSegment>}
        {featureVisibility.telemetry && (
          <StatusSegment icon={<Database size={12} />}>{formatBytes(bufferedBytes)}</StatusSegment>
        )}
      </div>

      <div className="flex min-w-0 items-center">
        {featureVisibility.telemetry && lastUpdate && (
          <StatusSegment icon={<Zap size={12} />}>
            {lastUpdate.changeType} +{formatBytes(lastUpdate.bytesRead)}{' '}
            {formatShortTime(lastUpdate.changedAt)}
          </StatusSegment>
        )}
        {errorMessage ? (
          <StatusSegment icon={<AlertTriangle size={12} />} tone="danger">
            {errorMessage}
          </StatusSegment>
        ) : (
          statusMessage && <StatusSegment>{statusMessage}</StatusSegment>
        )}
      </div>
    </footer>
  );
};

interface StatusSegmentProps {
  children: ReactNode;
  icon?: JSX.Element;
  tone?: 'default' | 'danger';
}

const StatusSegment = ({ children, icon, tone = 'default' }: StatusSegmentProps): JSX.Element => {
  return (
    <span
      className={[
        'flex h-full max-w-[34vw] items-center gap-1.5 border-r border-line px-2.5 transition-colors',
        tone === 'danger' ? 'bg-danger text-white' : 'hover:bg-ink-800 hover:text-readable',
      ].join(' ')}
    >
      {icon && <span className="text-subtle shrink-0">{icon}</span>}
      <span className="truncate font-mono text-[10px] tracking-wide">{children}</span>
    </span>
  );
};

import { FolderOpen, Maximize2, Moon, Settings, Sun, Upload } from 'lucide-react';
import { useMemo, useState, type DragEvent, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { formatBytes, formatShortTime } from '@renderer/features/files/fileFormatting';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

export const Sidebar = (): JSX.Element => {
  const [isDragging, setIsDragging] = useState(false);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const documentsByPath = useFileMonitorStore((state) => state.documentsByPath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const selectFilesFromDialog = useFileMonitorStore((state) => state.selectFilesFromDialog);
  const selectDirectoryFromDialog = useFileMonitorStore((state) => state.selectDirectoryFromDialog);
  const scanDroppedFiles = useFileMonitorStore((state) => state.scanDroppedFiles);
  const selectFile = useFileMonitorStore((state) => state.selectFile);
  const stopWatching = useFileMonitorStore((state) => state.stopWatching);
  const stopAllWatching = useFileMonitorStore((state) => state.stopAllWatching);
  const loadFile = useFileMonitorStore((state) => state.loadFile);
  const clearActiveView = useFileMonitorStore((state) => state.clearActiveView);
  const themeMode = useFileMonitorStore((state) => state.themeMode);
  const setThemeMode = useFileMonitorStore((state) => state.setThemeMode);
  const toggleSettingsPanel = useFileMonitorStore((state) => state.toggleSettingsPanel);
  const toggleLogViewerExpanded = useFileMonitorStore((state) => state.toggleLogViewerExpanded);
  const isBusy = useFileMonitorStore((state) => state.pendingOperations > 0);
  const files = useMemo(() => Object.values(filesByPath), [filesByPath]);
  const watchedEntries = useMemo(
    () =>
      Object.keys(watchingFiles)
        .map((filePath) => filesByPath[filePath])
        .filter((file): file is NonNullable<typeof file> => Boolean(file)),
    [filesByPath, watchingFiles],
  );
  const selectedFile = selectedFilePath ? filesByPath[selectedFilePath] : null;
  const selectedDocument = selectedFilePath ? documentsByPath[selectedFilePath] : null;

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    void scanDroppedFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <aside className="flex min-w-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/40 bg-accent-soft font-mono text-sm font-bold text-accent">
            ML
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-readable">Monitoring.Log</div>
            <div className="text-xs text-muted">Desktop log monitor</div>
          </div>
          <Button size="sm" variant="ghost" onClick={toggleSettingsPanel} aria-label="Settings">
            <Settings size={15} />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            onClick={() => {
              void selectFilesFromDialog();
            }}
            disabled={isBusy}
          >
            <Upload size={14} />
            Files
          </Button>
          <Button
            onClick={() => {
              void selectDirectoryFromDialog();
            }}
            disabled={isBusy}
          >
            <FolderOpen size={14} />
            Directory
          </Button>
        </div>

        <div
          className={[
            'mt-3 flex h-20 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs leading-5 transition',
            isDragging
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line bg-ink-950/50 text-muted',
          ].join(' ')}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDragLeave={() => {
            setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          Drop .log or .txt files and folders
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-line p-4">
        <Metric label="Files" value={files.length.toString()} />
        <Metric label="Watching" value={watchedEntries.length.toString()} tone="success" />
      </div>

      <section className="border-b border-line p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase text-subtle">Quick Actions</h2>
        </div>
        <div className="grid gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setThemeMode(themeMode === 'light' ? 'dark' : 'light');
            }}
          >
            {themeMode === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            {themeMode === 'light' ? 'Switch to Dark' : 'Switch to Light'}
          </Button>
          <Button variant="ghost" onClick={toggleLogViewerExpanded} disabled={!selectedFilePath}>
            <Maximize2 size={14} />
            Focus Log Viewer
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (selectedFilePath) {
                void loadFile(selectedFilePath);
              }
            }}
            disabled={!selectedFilePath || isBusy}
          >
            Reload Active
          </Button>
          <Button variant="ghost" onClick={clearActiveView} disabled={!selectedFilePath}>
            Clear Active View
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void stopAllWatching();
            }}
            disabled={watchedEntries.length === 0 || isBusy}
          >
            Stop All Watchers
          </Button>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase text-subtle">Watched Files</h2>
          <Badge tone={watchedEntries.length > 0 ? 'success' : 'neutral'}>
            {watchedEntries.length}
          </Badge>
        </div>

        {watchedEntries.length === 0 ? (
          <div className="rounded-lg border border-line bg-ink-950/50 p-3 text-xs leading-5 text-muted">
            Start watching a file to see live sources here.
          </div>
        ) : (
          <div className="space-y-2">
            {watchedEntries.map((file) => (
              <button
                key={file.path}
                type="button"
                className={[
                  'w-full rounded-lg border p-3 text-left transition',
                  selectedFilePath === file.path
                    ? 'border-accent/60 bg-accent-soft'
                    : 'border-line bg-ink-950/50 hover:border-line-strong hover:bg-ink-800',
                ].join(' ')}
                onClick={() => {
                  void selectFile(file.path);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-readable">
                    {file.name}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_12px_rgb(66_211_146/0.7)]" />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-subtle">
                  <span>{formatBytes(file.sizeBytes)}</span>
                  <button
                    type="button"
                    className="rounded border border-danger/40 px-1.5 py-0.5 text-danger hover:bg-danger-soft"
                    onClick={(event) => {
                      event.stopPropagation();
                      void stopWatching(file.path);
                    }}
                  >
                    Stop
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-line p-4 text-xs leading-5 text-muted">
        {selectedFile ? (
          <>
            <div className="truncate text-readable" title={selectedFile.path}>
              {selectedFile.name}
            </div>
            <div>
              {selectedDocument
                ? `Loaded ${formatBytes(selectedDocument.bytesRead)} at ${formatShortTime(
                    selectedDocument.lastUpdatedAt,
                  )}`
                : 'Not loaded yet'}
            </div>
          </>
        ) : (
          'No active file'
        )}
      </div>
    </aside>
  );
};

interface MetricProps {
  label: string;
  value: string;
  tone?: 'neutral' | 'success';
}

const Metric = ({ label, value, tone = 'neutral' }: MetricProps): JSX.Element => {
  return (
    <div className="rounded-lg border border-line bg-ink-950/50 p-3">
      <div className={tone === 'success' ? 'text-success' : 'text-readable'}>{value}</div>
      <div className="text-[11px] uppercase text-subtle">{label}</div>
    </div>
  );
};

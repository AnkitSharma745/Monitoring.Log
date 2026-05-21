import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  History,
  RotateCw,
  Upload,
} from 'lucide-react';
import { useMemo, useState, type DragEvent, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import {
  getWatcherHealth,
  type WatcherHealthTone,
} from '@renderer/features/activity/watcherHealth';
import { formatBytes, formatShortTime } from '@renderer/features/files/fileFormatting';
import { useCurrentTime } from '@renderer/hooks/useCurrentTime';
import {
  useFileMonitorStore,
  type RecentSourceItem,
  type WatchingFileState,
} from '@renderer/stores/fileMonitorStore';

import type { LogFileMetadata } from '@shared/contracts/files';

export const Sidebar = (): JSX.Element => {
  const [isDragging, setIsDragging] = useState(false);
  const [isRecentSourcesExpanded, setIsRecentSourcesExpanded] = useState(true);
  const [isWatchedFilesExpanded, setIsWatchedFilesExpanded] = useState(true);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const documentsByPath = useFileMonitorStore((state) => state.documentsByPath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const recentSources = useFileMonitorStore((state) => state.recentSources);
  const scanDroppedFiles = useFileMonitorStore((state) => state.scanDroppedFiles);
  const openRecentSource = useFileMonitorStore((state) => state.openRecentSource);
  const selectFile = useFileMonitorStore((state) => state.selectFile);
  const startWatching = useFileMonitorStore((state) => state.startWatching);
  const stopWatching = useFileMonitorStore((state) => state.stopWatching);
  const currentTime = useCurrentTime();
  const watchedEntries = useMemo(
    () =>
      Object.keys(watchingFiles)
        .map((filePath) => filesByPath[filePath])
        .filter((file): file is NonNullable<typeof file> => Boolean(file)),
    [filesByPath, watchingFiles],
  );
  const selectedFile = selectedFilePath ? filesByPath[selectedFilePath] : null;
  const selectedDocument = selectedFilePath ? documentsByPath[selectedFilePath] : null;

  const restartWatching = async (filePath: string): Promise<void> => {
    await stopWatching(filePath);
    await startWatching(filePath);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    void scanDroppedFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <aside className="flex min-w-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft font-mono text-[11px] font-bold text-accent">
            ML
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-readable">
              Monitoring.Log
            </div>
            <div className="text-[11px] text-muted">Sources and watcher state</div>
          </div>
        </div>

        <div
          className={[
            'mt-3 flex h-12 items-center justify-center rounded-md border border-dashed px-3 text-center text-[11px] leading-4 transition',
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
          <span className="inline-flex items-center gap-1.5">
            <Upload size={12} />
            Drop .log or .txt files and folders
          </span>
        </div>
      </div>

      {recentSources.length > 0 && (
        <section className="border-b border-line px-3 py-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => {
              setIsRecentSourcesExpanded((current) => !current);
            }}
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-subtle">
              {isRecentSourcesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Recent Sources
            </span>
            <Badge>{recentSources.length}</Badge>
          </button>
          {isRecentSourcesExpanded && (
            <div className="mt-2 grid gap-2">
              {recentSources.slice(0, 5).map((source) => (
                <RecentSourceButton key={source.path} source={source} onOpen={openRecentSource} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <button
          type="button"
          className="mb-2 flex w-full items-center justify-between text-left"
          onClick={() => {
            setIsWatchedFilesExpanded((current) => !current);
          }}
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-subtle">
            {isWatchedFilesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Watched Files
          </span>
          <Badge tone={watchedEntries.length > 0 ? 'success' : 'neutral'}>
            {watchedEntries.length}
          </Badge>
        </button>

        {isWatchedFilesExpanded &&
          (watchedEntries.length === 0 ? (
            <div className="rounded-md border border-line bg-ink-950/50 p-3 text-[11px] leading-5 text-muted">
              Start watching a file to see live sources here.
            </div>
          ) : (
            <div className="space-y-1.5">
              {watchedEntries.map((file) => (
                <WatchedFileCard
                  key={file.path}
                  file={file}
                  isSelected={selectedFilePath === file.path}
                  watcher={watchingFiles[file.path]}
                  currentTime={currentTime}
                  onSelect={selectFile}
                  onStop={stopWatching}
                  onRestart={restartWatching}
                />
              ))}
            </div>
          ))}
      </section>

      <div className="border-t border-line px-3 py-2 text-[11px] leading-5 text-muted">
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

interface RecentSourceButtonProps {
  source: RecentSourceItem;
  onOpen: (path: string) => Promise<void>;
}

const RecentSourceButton = ({ source, onOpen }: RecentSourceButtonProps): JSX.Element => {
  return (
    <button
      type="button"
      className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-line bg-ink-950/50 px-3 py-2 text-left text-xs transition hover:border-line-strong hover:bg-ink-800"
      title={source.path}
      onClick={() => {
        void onOpen(source.path);
      }}
    >
      {source.kind === 'directory' ? <History size={14} /> : <Clock3 size={14} />}
      <span className="min-w-0">
        <span className="block truncate font-medium text-readable">{source.name}</span>
        <span className="block truncate text-subtle">
          {source.kind} | {formatShortTime(source.lastOpenedAt)}
        </span>
      </span>
    </button>
  );
};

interface WatchedFileCardProps {
  file: LogFileMetadata;
  isSelected: boolean;
  watcher: WatchingFileState | undefined;
  currentTime: number;
  onSelect: (filePath: string) => Promise<void>;
  onStop: (filePath: string) => Promise<void>;
  onRestart: (filePath: string) => Promise<void>;
}

const WatchedFileCard = ({
  file,
  isSelected,
  watcher,
  currentTime,
  onSelect,
  onStop,
  onRestart,
}: WatchedFileCardProps): JSX.Element => {
  const health = watcher ? getWatcherHealth(watcher, currentTime) : null;

  return (
    <article
      className={[
        'w-full rounded-md border px-2.5 py-2 text-left transition',
        isSelected
          ? 'border-accent/60 bg-accent-soft'
          : 'border-line bg-ink-950/50 hover:border-line-strong hover:bg-ink-800',
      ].join(' ')}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => {
          void onSelect(file.path);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] font-medium text-readable">
            {file.name}
          </span>
          <span
            className={[
              'h-2 w-2 rounded-full',
              health ? healthDotClasses[health.tone] : 'bg-subtle',
            ].join(' ')}
          />
        </div>
      </button>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-subtle">
        <span>
          {formatBytes(file.sizeBytes)}
          {watcher ? ` | ${health?.label ?? 'Live'}` : ''}
        </span>
        <span className="flex items-center gap-1">
          {health?.tone === 'error' && <AlertTriangle size={12} className="text-danger" />}
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-line text-muted hover:bg-ink-800"
            aria-label={`Restart watcher for ${file.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void onRestart(file.path);
            }}
          >
            <RotateCw size={11} />
          </button>
          <button
            type="button"
            className="rounded border border-danger/40 px-1.5 py-0.5 text-danger hover:bg-danger-soft"
            aria-label={`Stop watcher for ${file.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void onStop(file.path);
            }}
          >
            Stop
          </button>
        </span>
      </div>
      {watcher?.lastUpdateAt && (
        <div className="mt-1 truncate text-[11px] text-subtle">
          Last update {formatShortTime(watcher.lastUpdateAt)} | {formatBytes(watcher.bytesRead)}
        </div>
      )}
      {watcher?.lastErrorMessage && (
        <div className="mt-1 truncate text-[11px] text-danger">{watcher.lastErrorMessage}</div>
      )}
    </article>
  );
};

const healthDotClasses: Record<WatcherHealthTone, string> = {
  error: 'bg-danger shadow-[0_0_12px_rgb(220_38_38/0.45)]',
  stale: 'bg-warning shadow-[0_0_12px_rgb(180_83_9/0.45)]',
  idle: 'bg-info shadow-[0_0_12px_rgb(3_105_161/0.45)]',
  healthy: 'bg-success shadow-[0_0_12px_rgb(66_211_146/0.7)]',
};

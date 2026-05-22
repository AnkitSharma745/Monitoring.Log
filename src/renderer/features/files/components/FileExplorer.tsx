import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Upload } from 'lucide-react';
import { useMemo, useState, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { Tooltip } from '@renderer/components/ui/Tooltip';
import { formatBytes } from '@renderer/features/files/fileFormatting';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

import type {
  DirectoryScanResult,
  DirectoryTreeNode,
  FileTreeNode,
  LogFileMetadata,
} from '@shared/contracts/files';

export const FileExplorer = (): JSX.Element => {
  const directories = useFileMonitorStore((state) => state.directories);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const selectFile = useFileMonitorStore((state) => state.selectFile);
  const startWatching = useFileMonitorStore((state) => state.startWatching);
  const stopWatching = useFileMonitorStore((state) => state.stopWatching);
  const removeFile = useFileMonitorStore((state) => state.removeFile);
  const removeDirectory = useFileMonitorStore((state) => state.removeDirectory);
  const selectFilesFromDialog = useFileMonitorStore((state) => state.selectFilesFromDialog);
  const selectDirectoryFromDialog = useFileMonitorStore((state) => state.selectDirectoryFromDialog);

  const files = useMemo(
    () => Object.values(filesByPath).sort((left, right) => left.path.localeCompare(right.path)),
    [filesByPath],
  );
  const watchedPaths = useMemo(() => new Set(Object.keys(watchingFiles)), [watchingFiles]);
  const looseFiles = useMemo(() => getLooseFiles(directories, files), [directories, files]);

  const toggleWatch = (filePath: string): void => {
    if (watchedPaths.has(filePath)) {
      void stopWatching(filePath);
      return;
    }

    void startWatching(filePath);
  };

  return (
    <aside className="flex min-w-0 flex-col border-r border-line bg-ink-900/90 h-full">
      <header className="flex h-11 items-center justify-between border-b border-line px-3 gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-readable truncate">
            Explorer
          </h2>
          <p className="text-[10px] text-muted truncate">{files.length} sources</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip label="Add log files...">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-ink-800 hover:text-readable transition outline-none cursor-pointer border-none"
              onClick={selectFilesFromDialog}
            >
              <Upload size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Open directory...">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-ink-800 hover:text-readable transition outline-none cursor-pointer border-none"
              onClick={selectDirectoryFromDialog}
            >
              <FolderOpen size={13} />
            </button>
          </Tooltip>
          <Badge
            tone={watchedPaths.size > 0 ? 'success' : 'neutral'}
            className="text-[9px] px-1 py-0.5 shrink-0 ml-0.5"
          >
            {watchedPaths.size} live
          </Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {files.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-ink-950/60 p-3 text-[11px] leading-5 text-muted">
            Select files or a directory to populate the explorer.
          </div>
        ) : (
          <>
            {looseFiles.length > 0 && (
              <section className="mb-4">
                <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-subtle">
                  Selected Files
                </div>
                {looseFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    depth={0}
                    isSelected={selectedFilePath === file.path}
                    isWatched={watchedPaths.has(file.path)}
                    onSelectFile={selectFile}
                    onToggleWatch={toggleWatch}
                    onRemoveFile={removeFile}
                  />
                ))}
              </section>
            )}

            {directories.map((directory) => (
              <DirectoryNode
                key={directory.root.path}
                node={directory.root}
                depth={0}
                selectedFilePath={selectedFilePath}
                watchedPaths={watchedPaths}
                onSelectFile={selectFile}
                onToggleWatch={toggleWatch}
                onRemoveDirectory={removeDirectory}
                onRemoveFile={removeFile}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  );
};

interface DirectoryNodeProps {
  node: DirectoryTreeNode;
  depth: number;
  selectedFilePath: string | null;
  watchedPaths: ReadonlySet<string>;
  onSelectFile: (filePath: string) => Promise<void>;
  onToggleWatch: (filePath: string) => void;
  onRemoveDirectory: (dirPath: string) => void;
  onRemoveFile: (filePath: string) => void;
}

const DirectoryNode = ({
  node,
  depth,
  selectedFilePath,
  watchedPaths,
  onSelectFile,
  onToggleWatch,
  onRemoveDirectory,
  onRemoveFile,
}: DirectoryNodeProps): JSX.Element => {
  const [expanded, setExpanded] = useState(true);

  return (
    <section>
      <div
        className="group grid h-7 w-full grid-cols-[14px_14px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-2 text-left text-[12px] text-muted transition hover:bg-ink-800 hover:text-readable cursor-pointer"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={node.path}
        onClick={() => {
          setExpanded((current) => !current);
        }}
      >
        <span className="flex items-center justify-center text-subtle select-none">
          {expanded ? (
            <ChevronDown size={12} className="stroke-[2.5]" />
          ) : (
            <ChevronRight size={12} className="stroke-[2.5]" />
          )}
        </span>
        <span className="flex items-center justify-center text-accent select-none">
          {expanded ? (
            <FolderOpen size={13} className="fill-accent/10" />
          ) : (
            <Folder size={13} className="fill-accent/10" />
          )}
        </span>
        <span className="truncate select-none font-medium text-readable">{node.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-ink-850 border border-line/30 px-1.5 py-0.5 text-[9px] font-mono text-subtle">
            {node.supportedFileCount}
          </span>
          {depth === 0 && (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-subtle opacity-0 transition hover:bg-ink-700 hover:text-danger group-hover:opacity-100 focus:opacity-100"
              title="Remove directory from workspace"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveDirectory(node.path);
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFilePath={selectedFilePath}
            watchedPaths={watchedPaths}
            onSelectFile={onSelectFile}
            onToggleWatch={onToggleWatch}
            onRemoveDirectory={onRemoveDirectory}
            onRemoveFile={onRemoveFile}
          />
        ))}
    </section>
  );
};

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedFilePath: string | null;
  watchedPaths: ReadonlySet<string>;
  onSelectFile: (filePath: string) => Promise<void>;
  onToggleWatch: (filePath: string) => void;
  onRemoveDirectory: (dirPath: string) => void;
  onRemoveFile: (filePath: string) => void;
}

const TreeNode = ({
  node,
  depth,
  selectedFilePath,
  watchedPaths,
  onSelectFile,
  onToggleWatch,
  onRemoveDirectory,
  onRemoveFile,
}: TreeNodeProps): JSX.Element => {
  if (node.kind === 'directory') {
    return (
      <DirectoryNode
        node={node}
        depth={depth}
        selectedFilePath={selectedFilePath}
        watchedPaths={watchedPaths}
        onSelectFile={onSelectFile}
        onToggleWatch={onToggleWatch}
        onRemoveDirectory={onRemoveDirectory}
        onRemoveFile={onRemoveFile}
      />
    );
  }

  return (
    <FileRow
      file={node}
      depth={depth}
      isSelected={selectedFilePath === node.path}
      isWatched={watchedPaths.has(node.path)}
      onSelectFile={onSelectFile}
      onToggleWatch={onToggleWatch}
      onRemoveFile={onRemoveFile}
    />
  );
};

interface FileRowProps {
  file: LogFileMetadata;
  depth: number;
  isSelected: boolean;
  isWatched: boolean;
  onSelectFile: (filePath: string) => Promise<void>;
  onToggleWatch: (filePath: string) => void;
  onRemoveFile: (filePath: string) => void;
}

const FileRow = ({
  file,
  depth,
  isSelected,
  isWatched,
  onSelectFile,
  onToggleWatch,
  onRemoveFile,
}: FileRowProps): JSX.Element => {
  return (
    <div
      className={[
        'group grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md pr-2 transition',
        isSelected ? 'bg-accent-soft text-readable shadow-sm' : 'text-muted hover:bg-ink-800',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: `${8 + depth * 14 + 14}px` }}
    >
      <button
        type="button"
        className="min-w-0 text-left py-1"
        title={file.path}
        onClick={() => {
          void onSelectFile(file.path);
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FileText
            size={13}
            className={[
              'shrink-0',
              isSelected
                ? 'text-accent'
                : 'text-subtle group-hover:text-readable transition-colors',
            ].join(' ')}
          />
          <span className="truncate text-[12px] font-medium">{file.name}</span>
          {isWatched && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-success shadow-[0_0_8px_rgba(66,211,146,0.8)] animate-pulse"
              title="Watching this file live"
            />
          )}
        </span>
        <span className="ml-5 block truncate text-[10px] text-subtle font-mono">
          {formatBytes(file.sizeBytes)}
        </span>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        <Tooltip label={isWatched ? 'Stop watching file' : 'Start watching file'}>
          <button
            type="button"
            className={[
              'h-5 rounded border px-1.5 text-[10px] font-semibold transition',
              isWatched
                ? 'border-success/50 bg-success-soft text-success'
                : 'border-line bg-ink-900 text-subtle hover:border-accent hover:text-accent',
            ].join(' ')}
            onClick={() => {
              onToggleWatch(file.path);
            }}
          >
            {isWatched ? 'Live' : 'Watch'}
          </button>
        </Tooltip>

        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-subtle opacity-0 transition hover:bg-ink-700 hover:text-danger group-hover:opacity-100 focus:opacity-100"
          title="Remove file from workspace"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFile(file.path);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

const getLooseFiles = (
  directories: DirectoryScanResult[],
  files: LogFileMetadata[],
): LogFileMetadata[] => {
  const directoryFilePaths = new Set(
    directories.flatMap((directory) => directory.files.map((file) => file.path)),
  );

  return files.filter((file) => !directoryFilePaths.has(file.path));
};

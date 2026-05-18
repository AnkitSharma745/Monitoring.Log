import { useMemo, useState, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
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
    <aside className="flex min-w-0 flex-col border-r border-line bg-ink-900/90">
      <header className="flex h-14 items-center justify-between border-b border-line px-4">
        <div>
          <h2 className="text-sm font-semibold text-readable">File Explorer</h2>
          <p className="text-xs text-muted">{files.length} discovered file(s)</p>
        </div>
        <Badge tone={watchedPaths.size > 0 ? 'success' : 'neutral'}>{watchedPaths.size} live</Badge>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-ink-950/60 p-4 text-sm leading-6 text-muted">
            Select files or a directory to populate the explorer.
          </div>
        ) : (
          <>
            {looseFiles.length > 0 && (
              <section className="mb-4">
                <div className="mb-2 px-2 text-[11px] font-bold uppercase text-subtle">
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
}

const DirectoryNode = ({
  node,
  depth,
  selectedFilePath,
  watchedPaths,
  onSelectFile,
  onToggleWatch,
}: DirectoryNodeProps): JSX.Element => {
  const [expanded, setExpanded] = useState(true);

  return (
    <section>
      <button
        type="button"
        className="grid h-8 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1 rounded-md px-2 text-left text-sm text-muted transition hover:bg-ink-800 hover:text-readable"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={node.path}
        onClick={() => {
          setExpanded((current) => !current);
        }}
      >
        <span className="font-mono text-xs">{expanded ? 'v' : '>'}</span>
        <span className="truncate">[D] {node.name}</span>
        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-subtle">
          {node.supportedFileCount}
        </span>
      </button>

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
}

const TreeNode = ({
  node,
  depth,
  selectedFilePath,
  watchedPaths,
  onSelectFile,
  onToggleWatch,
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
}

const FileRow = ({
  file,
  depth,
  isSelected,
  isWatched,
  onSelectFile,
  onToggleWatch,
}: FileRowProps): JSX.Element => {
  return (
    <div
      className={[
        'group grid min-h-9 grid-cols-[minmax(0,1fr)_54px] items-center gap-2 rounded-md pr-2 transition',
        isSelected ? 'bg-accent-soft text-readable shadow-glow' : 'text-muted hover:bg-ink-800',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <button
        type="button"
        className="min-w-0 text-left"
        title={file.path}
        onClick={() => {
          void onSelectFile(file.path);
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={[
              'h-2 w-2 shrink-0 rounded-full',
              isWatched ? 'bg-success shadow-[0_0_12px_rgb(66_211_146/0.65)]' : 'bg-subtle',
            ].join(' ')}
          />
          <span className="truncate text-sm">[F] {file.name}</span>
        </span>
        <span className="ml-4 block truncate text-[11px] text-subtle">
          {formatBytes(file.sizeBytes)}
        </span>
      </button>

      <button
        type="button"
        className={[
          'h-6 rounded border px-2 text-[11px] font-semibold transition',
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

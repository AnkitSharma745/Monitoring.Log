import { useState, type DragEvent, type JSX } from 'react';

import type {
  DirectoryScanResult,
  DirectoryTreeNode,
  FileTreeNode,
  LogFileMetadata,
  PathScanIssue,
} from '@shared/contracts/files';

interface FileSourcePanelProps {
  directories: DirectoryScanResult[];
  files: LogFileMetadata[];
  selectedFilePath: string | null;
  watchedPaths: ReadonlySet<string>;
  scanIssues: PathScanIssue[];
  isBusy: boolean;
  onSelectFile: (filePath: string) => void;
  onToggleWatch: (filePath: string) => void;
  onSelectFiles: () => void;
  onSelectDirectory: () => void;
  onDropFiles: (files: File[]) => void;
}

export const FileSourcePanel = ({
  directories,
  files,
  selectedFilePath,
  watchedPaths,
  scanIssues,
  isBusy,
  onSelectFile,
  onToggleWatch,
  onSelectFiles,
  onSelectDirectory,
  onDropFiles,
}: FileSourcePanelProps): JSX.Element => {
  const [isDragging, setIsDragging] = useState(false);
  const directoryFilePaths = new Set(
    directories.flatMap((directory) => directory.files.map((file) => file.path)),
  );
  const looseFiles = files.filter((file) => !directoryFilePaths.has(file.path));

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    onDropFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <aside className="source-panel">
      <div className="source-panel__actions">
        <button type="button" onClick={onSelectFiles} disabled={isBusy}>
          Select Files
        </button>
        <button type="button" onClick={onSelectDirectory} disabled={isBusy}>
          Select Directory
        </button>
      </div>

      <div
        className={`drop-target${isDragging ? ' drop-target--active' : ''}`}
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
        Drop .log or .txt files/folders
      </div>

      <div className="source-panel__summary">
        <span>{files.length} file(s)</span>
        <span>{watchedPaths.size} watched</span>
      </div>

      <div className="source-tree" aria-label="Discovered log sources">
        {looseFiles.length > 0 && (
          <section className="source-tree__group">
            <div className="source-tree__group-title">Selected Files</div>
            {looseFiles.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                selectedFilePath={selectedFilePath}
                watchedPaths={watchedPaths}
                onSelectFile={onSelectFile}
                onToggleWatch={onToggleWatch}
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
            onSelectFile={onSelectFile}
            onToggleWatch={onToggleWatch}
          />
        ))}
      </div>

      {scanIssues.length > 0 && (
        <div className="source-panel__issues">
          {scanIssues.slice(0, 4).map((issue) => (
            <div key={`${issue.path}-${issue.reason}`} title={issue.path}>
              {issue.reason}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};

interface DirectoryNodeProps {
  node: DirectoryTreeNode;
  depth: number;
  selectedFilePath: string | null;
  watchedPaths: ReadonlySet<string>;
  onSelectFile: (filePath: string) => void;
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
    <section className="directory-node">
      <button
        type="button"
        className="directory-node__header"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          setExpanded((current) => !current);
        }}
        title={node.path}
      >
        <span className="directory-node__chevron">{expanded ? '▾' : '▸'}</span>
        <span className="directory-node__name">{node.name}</span>
        <span className="directory-node__count">{node.supportedFileCount}</span>
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
  onSelectFile: (filePath: string) => void;
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
      selectedFilePath={selectedFilePath}
      watchedPaths={watchedPaths}
      onSelectFile={onSelectFile}
      onToggleWatch={onToggleWatch}
    />
  );
};

interface FileRowProps {
  file: LogFileMetadata;
  depth?: number;
  selectedFilePath: string | null;
  watchedPaths: ReadonlySet<string>;
  onSelectFile: (filePath: string) => void;
  onToggleWatch: (filePath: string) => void;
}

const FileRow = ({
  file,
  depth = 0,
  selectedFilePath,
  watchedPaths,
  onSelectFile,
  onToggleWatch,
}: FileRowProps): JSX.Element => {
  const isSelected = selectedFilePath === file.path;
  const isWatched = watchedPaths.has(file.path);

  return (
    <div
      className={`file-row${isSelected ? ' file-row--selected' : ''}`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <button
        type="button"
        className="file-row__select"
        onClick={() => {
          onSelectFile(file.path);
        }}
        title={file.path}
      >
        <span className="file-row__name">{file.name}</span>
        <span className="file-row__meta">{formatBytes(file.sizeBytes)}</span>
      </button>
      <button
        type="button"
        className={`file-row__watch${isWatched ? ' file-row__watch--active' : ''}`}
        onClick={() => {
          onToggleWatch(file.path);
        }}
      >
        {isWatched ? 'Stop' : 'Watch'}
      </button>
    </div>
  );
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

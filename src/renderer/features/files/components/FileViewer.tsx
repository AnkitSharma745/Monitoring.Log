import { useEffect, useRef, type JSX } from 'react';

import type { LoadedFileDocument } from '../types';
import type { LogFileMetadata } from '@shared/contracts/files';

interface FileViewerProps {
  selectedFile: LogFileMetadata | null;
  document: LoadedFileDocument | null;
  isWatching: boolean;
  isBusy: boolean;
  onReload: (filePath: string) => void;
  onStartWatching: (filePath: string) => void;
  onStopWatching: (filePath: string) => void;
}

export const FileViewer = ({
  selectedFile,
  document,
  isWatching,
  isBusy,
  onReload,
  onStartWatching,
  onStopWatching,
}: FileViewerProps): JSX.Element => {
  const contentRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [document?.content]);

  if (!selectedFile) {
    return (
      <section className="viewer viewer--empty">
        <div>No file selected</div>
      </section>
    );
  }

  return (
    <section className="viewer">
      <header className="viewer__header">
        <div className="viewer__identity">
          <h1>{selectedFile.name}</h1>
          <div title={selectedFile.path}>{selectedFile.path}</div>
        </div>

        <div className="viewer__actions">
          <button
            type="button"
            onClick={() => {
              onReload(selectedFile.path);
            }}
            disabled={isBusy}
          >
            Reload
          </button>
          <button
            type="button"
            className={isWatching ? 'button-danger' : 'button-primary'}
            onClick={() => {
              if (isWatching) {
                onStopWatching(selectedFile.path);
              } else {
                onStartWatching(selectedFile.path);
              }
            }}
            disabled={isBusy}
          >
            {isWatching ? 'Stop Watching' : 'Watch'}
          </button>
        </div>
      </header>

      <div className="viewer__meta">
        <span>{formatBytes(selectedFile.sizeBytes)}</span>
        <span>Modified {formatTimestamp(selectedFile.modifiedAt)}</span>
        {document?.truncatedHead && <span>Showing tail</span>}
        {document?.trimmedInRenderer && <span>Renderer buffer trimmed</span>}
        {isWatching && <span className="viewer__watching">Watching</span>}
      </div>

      <pre ref={contentRef} className="viewer__content">
        {document?.content ?? ''}
      </pre>
    </section>
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

const formatTimestamp = (timestamp: string): string => {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp));
};

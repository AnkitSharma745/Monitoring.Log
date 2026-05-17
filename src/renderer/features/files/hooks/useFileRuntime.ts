import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrapIpcResponse } from '../ipcResponse';
import type { LoadedFileDocument, WatchingFileState } from '../types';
import type { FileContentResult, FileUpdateEvent } from '@shared/contracts/files';

const INITIAL_READ_BYTES = 512 * 1024;
const MAX_RENDERER_CONTENT_CHARS = 300_000;

interface UseFileRuntimeResult {
  documentsByPath: Record<string, LoadedFileDocument>;
  watchingFiles: Record<string, WatchingFileState>;
  runtimeMessage: string | null;
  isBusy: boolean;
  loadFile: (filePath: string) => Promise<FileContentResult>;
  startWatching: (filePath: string) => Promise<void>;
  stopWatching: (filePath: string) => Promise<void>;
}

export const useFileRuntime = (): UseFileRuntimeResult => {
  const [documentsByPath, setDocumentsByPath] = useState<Record<string, LoadedFileDocument>>({});
  const [watchingFiles, setWatchingFiles] = useState<Record<string, WatchingFileState>>({});
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const watchingRef = useRef<Record<string, WatchingFileState>>({});

  useEffect(() => {
    watchingRef.current = watchingFiles;
  }, [watchingFiles]);

  const applyFileUpdate = useCallback((event: FileUpdateEvent): void => {
    setDocumentsByPath((currentDocuments) => {
      const currentDocument = currentDocuments[event.filePath];
      const nextContent =
        event.changeType === 'reset'
          ? event.content
          : `${currentDocument?.content ?? ''}${event.content}`;
      const trimmedContent = trimContent(nextContent);

      return {
        ...currentDocuments,
        [event.filePath]: {
          content: trimmedContent.content,
          bytesRead: (currentDocument?.bytesRead ?? 0) + event.bytesRead,
          startOffset: event.changeType === 'reset' ? 0 : (currentDocument?.startOffset ?? 0),
          nextOffset: event.nextOffset,
          truncatedHead: currentDocument?.truncatedHead ?? false,
          trimmedInRenderer:
            (currentDocument?.trimmedInRenderer ?? false) || trimmedContent.wasTrimmed,
          lastUpdatedAt: event.changedAt,
        },
      };
    });

    setWatchingFiles((currentWatchingFiles) => {
      const currentWatch = currentWatchingFiles[event.filePath];

      if (!currentWatch) {
        return currentWatchingFiles;
      }

      return {
        ...currentWatchingFiles,
        [event.filePath]: {
          ...currentWatch,
          offset: event.nextOffset,
        },
      };
    });
  }, []);

  useEffect(() => {
    const removeUpdateListener = window.desktop.files.onFileUpdated((event) => {
      applyFileUpdate(event);
    });
    const removeErrorListener = window.desktop.files.onWatchError((event) => {
      setRuntimeMessage(`${event.filePath}: ${event.message}`);
    });

    return () => {
      removeUpdateListener();
      removeErrorListener();
    };
  }, [applyFileUpdate]);

  useEffect(() => {
    return () => {
      for (const filePath of Object.keys(watchingRef.current)) {
        void window.desktop.files.stopWatching({ filePath });
      }
    };
  }, []);

  const loadFile = useCallback(async (filePath: string): Promise<FileContentResult> => {
    setIsBusy(true);
    setRuntimeMessage(null);

    try {
      const result = unwrapIpcResponse(
        await window.desktop.files.readFile({ filePath, maxBytes: INITIAL_READ_BYTES }),
      );
      const trimmedContent = trimContent(result.content);

      setDocumentsByPath((currentDocuments) => ({
        ...currentDocuments,
        [filePath]: {
          content: trimmedContent.content,
          bytesRead: result.bytesRead,
          startOffset: result.startOffset,
          nextOffset: result.nextOffset,
          truncatedHead: result.truncatedHead,
          trimmedInRenderer: trimmedContent.wasTrimmed,
          lastUpdatedAt: new Date().toISOString(),
        },
      }));

      return result;
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : 'Unable to read file.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const startWatching = useCallback(
    async (filePath: string): Promise<void> => {
      setIsBusy(true);
      setRuntimeMessage(null);

      try {
        const currentDocument = documentsByPath[filePath];
        const nextOffset = currentDocument?.nextOffset ?? (await loadFile(filePath)).nextOffset;
        const result = unwrapIpcResponse(
          await window.desktop.files.startWatching({ filePath, startOffset: nextOffset }),
        );

        setWatchingFiles((currentWatchingFiles) => ({
          ...currentWatchingFiles,
          [result.file.path]: {
            offset: result.offset,
            startedAt: new Date().toISOString(),
            alreadyWatching: result.alreadyWatching,
          },
        }));
      } catch (error) {
        setRuntimeMessage(error instanceof Error ? error.message : 'Unable to start watcher.');
      } finally {
        setIsBusy(false);
      }
    },
    [documentsByPath, loadFile],
  );

  const stopWatching = useCallback(async (filePath: string): Promise<void> => {
    setIsBusy(true);
    setRuntimeMessage(null);

    try {
      const result = unwrapIpcResponse(await window.desktop.files.stopWatching({ filePath }));

      setWatchingFiles((currentWatchingFiles) => {
        const nextWatchingFiles = { ...currentWatchingFiles };
        delete nextWatchingFiles[result.filePath];
        return nextWatchingFiles;
      });
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : 'Unable to stop watcher.');
    } finally {
      setIsBusy(false);
    }
  }, []);

  return {
    documentsByPath,
    watchingFiles,
    runtimeMessage,
    isBusy,
    loadFile,
    startWatching,
    stopWatching,
  };
};

const trimContent = (content: string): { content: string; wasTrimmed: boolean } => {
  if (content.length <= MAX_RENDERER_CONTENT_CHARS) {
    return { content, wasTrimmed: false };
  }

  return {
    content: content.slice(content.length - MAX_RENDERER_CONTENT_CHARS),
    wasTrimmed: true,
  };
};

import { useCallback, useMemo, useState } from 'react';

import { unwrapIpcResponse } from '../ipcResponse';

import type { DirectoryScanResult, LogFileMetadata, PathScanIssue } from '@shared/contracts/files';

interface UseFileSourcesResult {
  directories: DirectoryScanResult[];
  files: LogFileMetadata[];
  filesByPath: Record<string, LogFileMetadata>;
  selectedFile: LogFileMetadata | null;
  selectedFilePath: string | null;
  scanIssues: PathScanIssue[];
  statusMessage: string | null;
  isBusy: boolean;
  selectFile: (filePath: string) => void;
  selectFilesFromDialog: () => Promise<void>;
  selectDirectoryFromDialog: () => Promise<void>;
  scanDroppedFiles: (files: File[]) => Promise<void>;
}

export const useFileSources = (): UseFileSourcesResult => {
  const [directories, setDirectories] = useState<DirectoryScanResult[]>([]);
  const [filesByPath, setFilesByPath] = useState<Record<string, LogFileMetadata>>({});
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [scanIssues, setScanIssues] = useState<PathScanIssue[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const files = useMemo(() => {
    return Object.values(filesByPath).sort((left, right) => left.path.localeCompare(right.path));
  }, [filesByPath]);

  const selectedFile = selectedFilePath ? (filesByPath[selectedFilePath] ?? null) : null;

  const registerFiles = useCallback((incomingFiles: LogFileMetadata[]): void => {
    if (incomingFiles.length === 0) {
      return;
    }

    setFilesByPath((currentFiles) => {
      const nextFiles = { ...currentFiles };

      for (const file of incomingFiles) {
        nextFiles[file.path] = file;
      }

      return nextFiles;
    });

    const firstFile = incomingFiles.at(0);

    if (firstFile) {
      setSelectedFilePath((currentPath) => currentPath ?? firstFile.path);
    }
  }, []);

  const registerDirectories = useCallback(
    (incomingDirectories: DirectoryScanResult[]): void => {
      if (incomingDirectories.length === 0) {
        return;
      }

      setDirectories((currentDirectories) => {
        const directoryMap = new Map(
          currentDirectories.map((directory) => [directory.root.path, directory]),
        );

        for (const directory of incomingDirectories) {
          directoryMap.set(directory.root.path, directory);
        }

        return Array.from(directoryMap.values()).sort((left, right) =>
          left.root.path.localeCompare(right.root.path),
        );
      });

      registerFiles(incomingDirectories.flatMap((directory) => directory.files));
    },
    [registerFiles],
  );

  const selectFilesFromDialog = useCallback(async (): Promise<void> => {
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const result = unwrapIpcResponse(await window.desktop.files.selectFiles());

      if (!result.canceled) {
        registerFiles(result.files);
        setStatusMessage(`Selected ${result.files.length} file(s).`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to select files.');
    } finally {
      setIsBusy(false);
    }
  }, [registerFiles]);

  const selectDirectoryFromDialog = useCallback(async (): Promise<void> => {
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const result = unwrapIpcResponse(await window.desktop.files.selectDirectory());

      if (!result.canceled && result.scan) {
        registerDirectories([result.scan]);
        setStatusMessage(`Discovered ${result.scan.files.length} file(s).`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to select directory.');
    } finally {
      setIsBusy(false);
    }
  }, [registerDirectories]);

  const scanDroppedFiles = useCallback(
    async (droppedFiles: File[]): Promise<void> => {
      const paths = window.desktop.files.getDroppedPaths(droppedFiles);

      if (paths.length === 0) {
        setStatusMessage('No readable file paths were dropped.');
        return;
      }

      setIsBusy(true);
      setStatusMessage(null);
      setScanIssues([]);

      try {
        const result = unwrapIpcResponse(await window.desktop.files.scanPaths(paths));
        registerFiles(result.files);
        registerDirectories(result.directories);
        setScanIssues([
          ...result.errors,
          ...result.unsupportedPaths.map((path) => ({
            path,
            reason: 'Unsupported path or file type.',
          })),
        ]);
        setStatusMessage(
          `Discovered ${
            result.files.length +
            result.directories.reduce((count, directory) => count + directory.files.length, 0)
          } file(s).`,
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Unable to scan dropped paths.');
      } finally {
        setIsBusy(false);
      }
    },
    [registerDirectories, registerFiles],
  );

  return {
    directories,
    files,
    filesByPath,
    selectedFile,
    selectedFilePath,
    scanIssues,
    statusMessage,
    isBusy,
    selectFile: setSelectedFilePath,
    selectFilesFromDialog,
    selectDirectoryFromDialog,
    scanDroppedFiles,
  };
};

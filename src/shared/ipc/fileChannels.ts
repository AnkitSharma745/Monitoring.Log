export const FILE_IPC_CHANNELS = {
  selectFiles: 'files:select-files',
  selectDirectory: 'files:select-directory',
  scanPaths: 'files:scan-paths',
  scanDirectory: 'files:scan-directory',
  readFile: 'files:read-file',
  startWatching: 'files:start-watching',
  stopWatching: 'files:stop-watching',
  fileUpdated: 'files:file-updated',
  watchError: 'files:watch-error',
} as const;

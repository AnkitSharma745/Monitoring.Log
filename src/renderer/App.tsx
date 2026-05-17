import { useEffect, useMemo, type JSX } from 'react';

import { FileSourcePanel } from './features/files/components/FileSourcePanel';
import { FileViewer } from './features/files/components/FileViewer';
import { useFileRuntime } from './features/files/hooks/useFileRuntime';
import { useFileSources } from './features/files/hooks/useFileSources';

function App(): JSX.Element {
  const fileSources = useFileSources();
  const fileRuntime = useFileRuntime();
  const { loadFile } = fileRuntime;
  const watchedPaths = useMemo(
    () => new Set(Object.keys(fileRuntime.watchingFiles)),
    [fileRuntime.watchingFiles],
  );
  const selectedDocument = fileSources.selectedFilePath
    ? (fileRuntime.documentsByPath[fileSources.selectedFilePath] ?? null)
    : null;
  const isBusy = fileSources.isBusy || fileRuntime.isBusy;
  const statusMessage = fileRuntime.runtimeMessage ?? fileSources.statusMessage;

  useEffect(() => {
    if (!fileSources.selectedFilePath) {
      return;
    }

    void loadFile(fileSources.selectedFilePath);
  }, [loadFile, fileSources.selectedFilePath]);

  const handleToggleWatch = (filePath: string): void => {
    if (watchedPaths.has(filePath)) {
      void fileRuntime.stopWatching(filePath);
      return;
    }

    void fileRuntime.startWatching(filePath);
  };

  return (
    <main className="app-shell">
      <FileSourcePanel
        directories={fileSources.directories}
        files={fileSources.files}
        selectedFilePath={fileSources.selectedFilePath}
        watchedPaths={watchedPaths}
        scanIssues={fileSources.scanIssues}
        isBusy={isBusy}
        onSelectFile={fileSources.selectFile}
        onToggleWatch={handleToggleWatch}
        onSelectFiles={() => {
          void fileSources.selectFilesFromDialog();
        }}
        onSelectDirectory={() => {
          void fileSources.selectDirectoryFromDialog();
        }}
        onDropFiles={(files) => {
          void fileSources.scanDroppedFiles(files);
        }}
      />

      <section className="workspace">
        <div className="workspace__topbar">
          <div>
            <strong>Monitoring.Log</strong>
            <span>Phase 2 file source runtime</span>
          </div>
          {statusMessage && <div className="workspace__status">{statusMessage}</div>}
        </div>

        <FileViewer
          selectedFile={fileSources.selectedFile}
          document={selectedDocument}
          isWatching={
            fileSources.selectedFilePath ? watchedPaths.has(fileSources.selectedFilePath) : false
          }
          isBusy={isBusy}
          onReload={(filePath) => {
            void fileRuntime.loadFile(filePath);
          }}
          onStartWatching={(filePath) => {
            void fileRuntime.startWatching(filePath);
          }}
          onStopWatching={(filePath) => {
            void fileRuntime.stopWatching(filePath);
          }}
        />
      </section>
    </main>
  );
}

export default App;

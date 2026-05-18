import { FileExplorer } from '@renderer/features/files/components/FileExplorer';
import { LogViewer } from '@renderer/features/logViewer/components/LogViewer';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { SettingsPanel } from './SettingsPanel';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { WorkspaceControls } from './WorkspaceControls';

import type { JSX } from 'react';

export const AppLayout = (): JSX.Element => {
  const isSidebarVisible = useFileMonitorStore((state) => state.isSidebarVisible);
  const isExplorerVisible = useFileMonitorStore((state) => state.isExplorerVisible);
  const isLogViewerExpanded = useFileMonitorStore((state) => state.isLogViewerExpanded);
  const gridTemplateColumns = getGridTemplateColumns(
    isSidebarVisible,
    isExplorerVisible,
    isLogViewerExpanded,
  );

  if (isLogViewerExpanded) {
    return (
      <main className="relative grid h-screen w-screen grid-rows-[minmax(0,1fr)] overflow-hidden bg-ink-950 text-readable">
        <LogViewer />
        <WorkspaceControls />
        <SettingsPanel />
      </main>
    );
  }

  return (
    <main
      className="relative grid h-screen w-screen grid-rows-[minmax(0,1fr)_34px] overflow-hidden border border-line bg-ink-950 text-readable"
      style={{ gridTemplateColumns }}
    >
      {isSidebarVisible && <Sidebar />}
      {isExplorerVisible && <FileExplorer />}
      <LogViewer />
      <StatusBar />
      <WorkspaceControls />
      <SettingsPanel />
    </main>
  );
};

const getGridTemplateColumns = (
  isSidebarVisible: boolean,
  isExplorerVisible: boolean,
  isLogViewerExpanded: boolean,
): string => {
  if (isLogViewerExpanded) {
    return 'minmax(0, 1fr)';
  }

  const columns: string[] = [];

  if (isSidebarVisible) {
    columns.push('260px');
  }

  if (isExplorerVisible) {
    columns.push('330px');
  }

  columns.push('minmax(0, 1fr)');

  return columns.join(' ');
};

import {
  FolderOpen,
  FolderTree,
  Maximize2,
  PanelLeft,
  Play,
  Settings2,
  Square,
  Upload,
} from 'lucide-react';

import { Badge } from '@renderer/components/ui/Badge';
import { Button } from '@renderer/components/ui/Button';
import { Tooltip } from '@renderer/components/ui/Tooltip';
import { getShortcutLabel } from '@renderer/features/shortcuts/shortcutDefinitions';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

import type { JSX } from 'react';

export const TopWorkspaceBar = (): JSX.Element => {
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const openTabs = useFileMonitorStore((state) => state.openTabs);
  const isSidebarVisible = useFileMonitorStore((state) => state.isSidebarVisible);
  const isExplorerVisible = useFileMonitorStore((state) => state.isExplorerVisible);
  const isLogViewerExpanded = useFileMonitorStore((state) => state.isLogViewerExpanded);
  const pendingOperations = useFileMonitorStore((state) => state.pendingOperations);
  const selectFilesFromDialog = useFileMonitorStore((state) => state.selectFilesFromDialog);
  const selectDirectoryFromDialog = useFileMonitorStore((state) => state.selectDirectoryFromDialog);
  const stopAllWatching = useFileMonitorStore((state) => state.stopAllWatching);
  const toggleSidebarVisibility = useFileMonitorStore((state) => state.toggleSidebarVisibility);
  const toggleExplorerVisibility = useFileMonitorStore((state) => state.toggleExplorerVisibility);
  const toggleLogViewerExpanded = useFileMonitorStore((state) => state.toggleLogViewerExpanded);
  const toggleSettingsPanel = useFileMonitorStore((state) => state.toggleSettingsPanel);
  const selectedFileName = selectedFilePath ? (filesByPath[selectedFilePath]?.name ?? null) : null;
  const watcherCount = Object.keys(watchingFiles).length;

  return (
    <header className="col-[1/-1] flex h-10 min-w-0 items-center justify-between border-b border-line bg-panel px-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex h-6 w-6 items-center justify-center rounded border border-accent/30 bg-accent-soft font-mono text-[10px] font-bold text-accent">
          ML
        </div>
        <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-readable">
          Monitoring.Log
        </span>

        <Tooltip label="Open files" shortcut={getShortcutLabel('openFiles')}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void selectFilesFromDialog();
            }}
            disabled={pendingOperations > 0}
            aria-label="Open files"
          >
            <Upload size={13} />
            Files
          </Button>
        </Tooltip>

        <Tooltip label="Open folder" shortcut={getShortcutLabel('openDirectory')}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void selectDirectoryFromDialog();
            }}
            disabled={pendingOperations > 0}
            aria-label="Open folder"
          >
            <FolderOpen size={13} />
            Folder
          </Button>
        </Tooltip>

        <Tooltip label="Toggle source rail" shortcut={getShortcutLabel('toggleSidebar')}>
          <Button
            size="sm"
            variant={isSidebarVisible ? 'secondary' : 'ghost'}
            onClick={toggleSidebarVisibility}
            aria-label="Toggle source rail"
          >
            <PanelLeft size={13} />
          </Button>
        </Tooltip>

        <Tooltip label="Toggle explorer">
          <Button
            size="sm"
            variant={isExplorerVisible ? 'secondary' : 'ghost'}
            onClick={toggleExplorerVisibility}
            aria-label="Toggle explorer"
          >
            <FolderTree size={13} />
          </Button>
        </Tooltip>

        <Tooltip label={isLogViewerExpanded ? 'Exit focus view' : 'Enter focus view'}>
          <Button
            size="sm"
            variant={isLogViewerExpanded ? 'secondary' : 'ghost'}
            onClick={toggleLogViewerExpanded}
            aria-label={isLogViewerExpanded ? 'Exit focus view' : 'Enter focus view'}
          >
            <Maximize2 size={13} />
          </Button>
        </Tooltip>

        <Tooltip label={watcherCount > 0 ? 'Stop all watchers' : 'No active watchers'}>
          <Button
            size="sm"
            variant={watcherCount > 0 ? 'ghost' : 'secondary'}
            onClick={() => {
              void stopAllWatching();
            }}
            disabled={watcherCount === 0 || pendingOperations > 0}
            aria-label="Stop all watchers"
          >
            {watcherCount > 0 ? <Square size={13} /> : <Play size={13} />}
            Watchers
          </Button>
        </Tooltip>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        {selectedFileName && (
          <span className="max-w-[260px] truncate text-[11px] text-muted">{selectedFileName}</span>
        )}
        <Badge tone={pendingOperations > 0 ? 'info' : 'neutral'}>
          {pendingOperations > 0 ? 'Working' : 'Ready'}
        </Badge>
        <Badge tone={watcherCount > 0 ? 'success' : 'neutral'}>{watcherCount} live</Badge>
        <Badge>{openTabs.length} tabs</Badge>

        <Tooltip label="Open settings" shortcut={getShortcutLabel('toggleSettings')}>
          <Button
            size="sm"
            variant="secondary"
            onClick={toggleSettingsPanel}
            aria-label="Open settings"
          >
            <Settings2 size={13} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
};

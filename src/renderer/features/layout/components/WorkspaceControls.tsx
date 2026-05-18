import { FolderTree, PanelLeft, Settings } from 'lucide-react';

import { Button } from '@renderer/components/ui/Button';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

import type { JSX } from 'react';

export const WorkspaceControls = (): JSX.Element => {
  const isSidebarVisible = useFileMonitorStore((state) => state.isSidebarVisible);
  const isExplorerVisible = useFileMonitorStore((state) => state.isExplorerVisible);
  const toggleSidebarVisibility = useFileMonitorStore((state) => state.toggleSidebarVisibility);
  const toggleExplorerVisibility = useFileMonitorStore((state) => state.toggleExplorerVisibility);
  const toggleSettingsPanel = useFileMonitorStore((state) => state.toggleSettingsPanel);

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-2">
      <Button
        size="sm"
        variant={isSidebarVisible ? 'secondary' : 'primary'}
        className="pointer-events-auto shadow-panel"
        onClick={toggleSidebarVisibility}
        aria-label="Toggle sidebar"
      >
        <PanelLeft size={14} />
      </Button>
      <Button
        size="sm"
        variant={isExplorerVisible ? 'secondary' : 'primary'}
        className="pointer-events-auto shadow-panel"
        onClick={toggleExplorerVisibility}
        aria-label="Toggle file explorer"
      >
        <FolderTree size={14} />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="pointer-events-auto shadow-panel"
        onClick={toggleSettingsPanel}
        aria-label="Open settings"
      >
        <Settings size={14} />
      </Button>
    </div>
  );
};

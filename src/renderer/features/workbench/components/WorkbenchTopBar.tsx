import {
  Activity,
  FolderOpen,
  Minus,
  PanelBottom,
  PanelLeft,
  Square,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@renderer/components/ui/Button';
import { Tooltip } from '@renderer/components/ui/Tooltip';
import { getShortcutLabel } from '@renderer/features/shortcuts/shortcutDefinitions';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useWorkbenchStore } from '../workbenchStore';

import type { JSX } from 'react';

export const WorkbenchTopBar = (): JSX.Element => {
  const pendingOperations = useFileMonitorStore((state) => state.pendingOperations);
  const selectFilesFromDialog = useFileMonitorStore((state) => state.selectFilesFromDialog);
  const selectDirectoryFromDialog = useFileMonitorStore((state) => state.selectDirectoryFromDialog);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const toggleSidePanel = useWorkbenchStore((state) => state.toggleSidePanel);
  const toggleBottomPanel = useWorkbenchStore((state) => state.toggleBottomPanel);
  const selectedFileName = selectedFilePath ? filesByPath[selectedFilePath]?.name : null;

  return (
    <header className="app-drag col-[1/-1] flex h-9 min-w-0 items-center gap-1.5 overflow-hidden border-b border-line bg-panel px-2">
      {/* Branding Logo */}
      <div className="app-no-drag flex min-w-0 shrink-0 select-none items-center gap-1.5 pr-1">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent text-panel shadow-sm shadow-accent/20">
          <Activity size={13} className="stroke-[3]" />
        </div>
        <span className="hidden truncate font-sans text-[11px] font-bold uppercase text-readable sm:inline">
          Monitoring<span className="text-accent">.</span>Log
        </span>
      </div>

      {/* Centered Document Title Bar */}
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
        <div className="app-no-drag flex h-6 min-w-0 max-w-xl flex-1 select-none items-center gap-1.5 overflow-hidden rounded border border-line bg-ink-950/60 px-2 text-[11px] text-muted transition hover:border-accent/40">
          <Activity size={10} className="text-accent shrink-0" />
          {selectedFileName ? (
            <span className="min-w-0 truncate">
              <span className="font-medium text-readable">{selectedFileName}</span>
              <span className="mx-1.5 text-subtle">—</span>
              <span className="hidden text-[10px] text-subtle font-mono md:inline">
                {selectedFilePath}
              </span>
            </span>
          ) : (
            <span className="text-subtle">No active document</span>
          )}
        </div>
      </div>

      {/* Action Buttons & Window Controls */}
      <div className="app-no-drag flex min-w-0 shrink-0 items-center gap-0.5 overflow-hidden">
        <Tooltip placement="right" label="Open files" shortcut={getShortcutLabel('openFiles')}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            disabled={pendingOperations > 0}
            aria-label="Open files"
            onClick={() => {
              void selectFilesFromDialog();
            }}
          >
            <Upload size={13} />
          </Button>
        </Tooltip>
        <Tooltip placement="right" label="Open folder" shortcut={getShortcutLabel('openDirectory')}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            disabled={pendingOperations > 0}
            aria-label="Open folder"
            onClick={() => {
              void selectDirectoryFromDialog();
            }}
          >
            <FolderOpen size={13} />
          </Button>
        </Tooltip>
        <Tooltip placement="right" label="Toggle side panel">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            aria-label="Toggle side panel"
            onClick={toggleSidePanel}
          >
            <PanelLeft size={13} />
          </Button>
        </Tooltip>
        <Tooltip placement="right" label="Toggle bottom panel">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            aria-label="Toggle bottom panel"
            onClick={toggleBottomPanel}
          >
            <PanelBottom size={13} />
          </Button>
        </Tooltip>
        <div className="mx-0.5 h-5 w-px shrink-0 bg-line" />
        <WindowControl label="Minimize" onClick={window.desktop.app.minimizeWindow}>
          <Minus size={14} />
        </WindowControl>
        <WindowControl
          label="Maximize or restore"
          onClick={window.desktop.app.toggleMaximizeWindow}
        >
          <Square size={13} />
        </WindowControl>
        <WindowControl label="Close" danger onClick={window.desktop.app.closeWindow}>
          <X size={15} />
        </WindowControl>
      </div>
    </header>
  );
};

interface WindowControlProps {
  label: string;
  children: JSX.Element;
  danger?: boolean;
  onClick: () => Promise<void>;
}

const WindowControl = ({
  label,
  children,
  danger = false,
  onClick,
}: WindowControlProps): JSX.Element => {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        className={[
          'flex h-9 w-10 shrink-0 items-center justify-center text-muted transition hover:text-readable',
          danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-ink-800',
        ].join(' ')}
        aria-label={label}
        onClick={() => {
          void onClick();
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
};

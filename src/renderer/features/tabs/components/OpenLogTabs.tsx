import { Circle, Pin, PinOff, X } from 'lucide-react';

import { Tooltip } from '@renderer/components/ui/Tooltip';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

import type { JSX } from 'react';

export const OpenLogTabs = (): JSX.Element | null => {
  const openTabs = useFileMonitorStore((state) => state.openTabs);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const selectFile = useFileMonitorStore((state) => state.selectFile);
  const closeTab = useFileMonitorStore((state) => state.closeTab);
  const pinTab = useFileMonitorStore((state) => state.pinTab);

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div className="flex min-h-10 items-end gap-1 overflow-x-auto border-b border-line bg-ink-900 px-2 pt-2">
      {openTabs.map((tab) => {
        const file = filesByPath[tab.filePath];
        const isSelected = selectedFilePath === tab.filePath;
        const isWatching = Boolean(watchingFiles[tab.filePath]);

        return (
          <div
            key={tab.filePath}
            className={[
              'group flex h-8 max-w-56 items-center gap-2 rounded-t-md border border-b-0 px-2 text-xs transition',
              isSelected
                ? 'border-line bg-panel text-readable'
                : 'border-transparent bg-ink-800 text-muted hover:border-line hover:text-readable',
            ].join(' ')}
            title={tab.filePath}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2"
              onClick={() => {
                void selectFile(tab.filePath);
              }}
            >
              <Circle
                size={8}
                className={isWatching ? 'fill-success text-success' : 'fill-subtle text-subtle'}
              />
              <span className="truncate">{file?.name ?? tab.filePath}</span>
              {tab.unreadCount > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">
                  {tab.unreadCount}
                </span>
              )}
            </button>

            <Tooltip label={tab.pinned ? 'Unpin tab' : 'Pin tab'}>
              <button
                type="button"
                className="text-subtle hover:text-accent"
                onClick={() => {
                  pinTab(tab.filePath);
                }}
              >
                {tab.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
            </Tooltip>

            <Tooltip label="Close tab" shortcut="Ctrl/Cmd+W">
              <button
                type="button"
                className="text-subtle hover:text-danger disabled:opacity-40"
                disabled={tab.pinned}
                onClick={() => {
                  closeTab(tab.filePath);
                }}
              >
                <X size={13} />
              </button>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
};

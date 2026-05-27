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
    <div className="no-scrollbar flex h-9 min-h-9 shrink-0 items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-line bg-ink-900 px-2 pt-1">
      {openTabs.map((tab) => {
        const file = filesByPath[tab.filePath];
        const isSelected = selectedFilePath === tab.filePath;
        const isWatching = Boolean(watchingFiles[tab.filePath]);

        return (
          <div
            key={tab.filePath}
            className={[
              'group flex h-8 min-w-24 max-w-56 shrink-0 items-center gap-1.5 overflow-hidden rounded-t border border-b-0 px-2 text-xs transition',
              isSelected
                ? 'border-line bg-panel text-readable'
                : 'border-transparent bg-ink-800 text-muted hover:border-line hover:text-readable',
            ].join(' ')}
            title={tab.filePath}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
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
                <span className="flex h-4 min-w-4 max-w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-accent px-1 text-[10px] leading-4 text-white">
                  {tab.unreadCount}
                </span>
              )}
            </button>

            {/* Pin Tab Button */}
            <Tooltip label={tab.pinned ? 'Unpin tab' : 'Pin tab'}>
              <button
                type="button"
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center text-subtle transition-opacity hover:text-accent focus:opacity-100',
                  tab.pinned
                    ? 'opacity-80'
                    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                ].join(' ')}
                onClick={() => {
                  pinTab(tab.filePath);
                }}
              >
                {tab.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
            </Tooltip>

            {/* Close Tab Button */}
            {!tab.pinned && (
              <Tooltip label="Close tab" shortcut="Ctrl+W">
                <button
                  type="button"
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={() => {
                    closeTab(tab.filePath);
                  }}
                >
                  <X size={13} />
                </button>
              </Tooltip>
            )}
          </div>
        );
      })}
    </div>
  );
};

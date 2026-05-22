import {
  Activity,
  Bot,
  Bug,
  Clock3,
  Files,
  RadioTower,
  Search,
  Settings,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';

import { Tooltip } from '@renderer/components/ui/Tooltip';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useWorkbenchStore, type WorkbenchSidePanel } from '../workbenchStore';

import type { JSX } from 'react';

interface ActivityItem {
  id: WorkbenchSidePanel | 'aiEvidence' | 'incidents' | 'settings';
  label: string;
  shortcut?: string;
  icon: typeof Files;
}

const activityItems: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', shortcut: 'Ctrl/Cmd+B', icon: Files },
  { id: 'search', label: 'Search', shortcut: 'Ctrl/Cmd+F', icon: Search },
  { id: 'watchers', label: 'Watchers', icon: RadioTower },
  { id: 'investigations', label: 'Investigations', icon: Bug },
  { id: 'timeline', label: 'Timeline', icon: Clock3 },
  { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
  { id: 'aiEvidence', label: 'AI Evidence', icon: Bot },
  { id: 'incidents', label: 'Incidents', icon: ShieldAlert },
];


const settingsItem: ActivityItem = {
  id: 'settings',
  label: 'Settings',
  shortcut: 'Ctrl/Cmd+,',
  icon: Settings,
};

export const ActivityBar = (): JSX.Element => {
  const activeSidePanel = useWorkbenchStore((state) => state.activeSidePanel);
  const isSidePanelVisible = useWorkbenchStore((state) => state.isSidePanelVisible);
  const setActiveSidePanel = useWorkbenchStore((state) => state.setActiveSidePanel);
  const toggleSettingsPanel = useFileMonitorStore((state) => state.toggleSettingsPanel);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const openTabs = useFileMonitorStore((state) => state.openTabs);
  const watcherCount = Object.keys(watchingFiles).length;

  const getBadgeValue = (id: ActivityItem['id']): number | null => {
    if (id === 'watchers') {
      return watcherCount;
    }

    if (id === 'explorer') {
      return openTabs.length;
    }

    return null;
  };

  const renderActivityItem = (item: ActivityItem): JSX.Element => {
    const Icon = item.icon;
    const isSidePanelItem = isWorkbenchSidePanel(item.id);
    const isActive = isSidePanelItem && activeSidePanel === item.id && isSidePanelVisible;
    const badgeValue = getBadgeValue(item.id);

    return (
      <Tooltip key={item.id} label={item.label} shortcut={item.shortcut} placement="right">
        <button
          type="button"
          className={[
            'relative flex h-10 w-10 items-center justify-center border-l-2 text-muted transition hover:bg-ink-800 hover:text-readable',
            isActive ? 'border-accent bg-ink-800 text-accent' : 'border-transparent',
          ].join(' ')}
          aria-label={item.label}
          onClick={() => {
            if (isWorkbenchSidePanel(item.id)) {
              setActiveSidePanel(item.id);
              return;
            }

            if (item.id === 'settings') {
              toggleSettingsPanel();
            }
          }}
        >
          <Icon size={18} />
          {badgeValue !== null && badgeValue > 0 && (
            <span className="absolute right-1 top-1 min-w-4 rounded-full bg-accent px-1 text-[9px] font-bold leading-4 text-white">
              {badgeValue > 9 ? '9+' : badgeValue}
            </span>
          )}
        </button>
      </Tooltip>
    );
  };

  return (
    <nav className="row-[2/4] flex w-11 flex-col items-center border-r border-line bg-ink-900 py-2">
      {/* Brand logo at top left corner of the activity area */}
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-accent/15 text-accent shadow-sm border border-accent/25 transition-transform duration-300 hover:rotate-12">
        <Activity size={16} className="stroke-[2.5]" />
      </div>

      <div className="flex flex-col items-center">{activityItems.map(renderActivityItem)}</div>
      <div className="mt-auto flex flex-col items-center border-t border-line pt-1">
        {renderActivityItem(settingsItem)}
      </div>
    </nav>
  );
};

const isWorkbenchSidePanel = (value: ActivityItem['id']): value is WorkbenchSidePanel => {
  return (
    value === 'explorer' ||
    value === 'search' ||
    value === 'watchers' ||
    value === 'investigations' ||
    value === 'timeline' ||
    value === 'knowledge'
  );
};

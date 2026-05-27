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
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useWorkbenchStore, type WorkbenchSidePanel } from '../workbenchStore';

import type { JSX } from 'react';

interface ActivityItem {
  id: WorkbenchSidePanel | 'aiEvidence' | 'incidents' | 'settings';
  label: string;
  shortcut?: string;
  icon: typeof Files;
}

const activityItems: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', shortcut: 'Ctrl+B', icon: Files },
  { id: 'search', label: 'Search', shortcut: 'Ctrl+F', icon: Search },
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
  shortcut: 'Ctrl+,',
  icon: Settings,
};

export const ActivityBar = (): JSX.Element => {
  const activeSidePanel = useWorkbenchStore((state) => state.activeSidePanel);
  const isSidePanelVisible = useWorkbenchStore((state) => state.isSidePanelVisible);
  const setActiveSidePanel = useWorkbenchStore((state) => state.setActiveSidePanel);
  const setActiveBottomPanel = useWorkbenchStore((state) => state.setActiveBottomPanel);
  const toggleSettingsPanel = useFileMonitorStore((state) => state.toggleSettingsPanel);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const openTabs = useFileMonitorStore((state) => state.openTabs);
  const featureVisibility = useSettingsStore((state) => state.preferences.featureVisibility);
  const watcherCount = Object.keys(watchingFiles).length;
  const visibleActivityItems = activityItems.filter((item) => {
    if (!featureVisibility.activityRail) {
      return item.id === 'explorer' || item.id === 'search';
    }
    if (item.id === 'watchers') return featureVisibility.watchers;
    if (item.id === 'knowledge') return featureVisibility.knowledge;
    if (item.id === 'timeline') return featureVisibility.timeline;
    if (item.id === 'aiEvidence') return featureVisibility.aiEvidence;
    if (item.id === 'incidents') return featureVisibility.incidents;
    return true;
  });

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
            'relative flex h-9 w-10 items-center justify-center border-l-2 text-muted transition hover:bg-ink-800 hover:text-readable',
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
              return;
            }

            if (item.id === 'aiEvidence') {
              setActiveBottomPanel('aiEvidence');
              return;
            }

            if (item.id === 'incidents') {
              setActiveSidePanel('investigations');
            }
          }}
        >
          <Icon size={18} />
          {badgeValue !== null && badgeValue > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 max-w-5 items-center justify-center overflow-hidden rounded bg-accent px-1 text-[9px] font-bold leading-4 text-white">
              {badgeValue > 9 ? '9+' : badgeValue}
            </span>
          )}
        </button>
      </Tooltip>
    );
  };

  return (
    <nav className="row-[2/4] flex w-11 flex-col items-center overflow-hidden border-r border-line bg-ink-900 py-1.5">
      {/* Brand logo at top left corner of the activity area */}
      <div className="mb-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-accent/25 bg-accent/15 text-accent shadow-sm">
        <Activity size={16} className="stroke-[2.5]" />
      </div>

      <div className="flex flex-col items-center">
        {visibleActivityItems.map(renderActivityItem)}
      </div>
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

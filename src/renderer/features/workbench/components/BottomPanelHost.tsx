import { ChevronDown, GripHorizontal } from 'lucide-react';
import { useCallback, useMemo, type JSX, type PointerEvent } from 'react';

import { Button } from '@renderer/components/ui/Button';
import { ViewRegistryService } from '@renderer/services/workbenchServices';
import {
  useSettingsStore,
  type FeatureVisibilityPreferences,
} from '@renderer/stores/settingsStore';
import { useWorkbenchStore, type WorkbenchBottomPanel } from '../workbenchStore';
import { WorkbenchPlaceholder } from './WorkbenchPlaceholder';

export const BottomPanelHost = (): JSX.Element | null => {
  const activeBottomPanel = useWorkbenchStore((state) => state.activeBottomPanel);
  const isBottomPanelVisible = useWorkbenchStore((state) => state.isBottomPanelVisible);
  const bottomPanelHeight = useWorkbenchStore((state) => state.bottomPanelHeight);
  const setActiveBottomPanel = useWorkbenchStore((state) => state.setActiveBottomPanel);
  const setBottomPanelHeight = useWorkbenchStore((state) => state.setBottomPanelHeight);
  const toggleBottomPanel = useWorkbenchStore((state) => state.toggleBottomPanel);
  const featureVisibility = useSettingsStore((state) => state.preferences.featureVisibility);

  const bottomPanelItems = useMemo(() => {
    return ViewRegistryService.getBottomPanels()
      .filter((panel) =>
        isBottomPanelFeatureVisible(panel.id as WorkbenchBottomPanel, featureVisibility),
      )
      .map((panel) => ({
        id: panel.id as WorkbenchBottomPanel,
        label: panel.title,
      }));
  }, [featureVisibility]);
  const activeVisiblePanel = bottomPanelItems.some((item) => item.id === activeBottomPanel)
    ? activeBottomPanel
    : (bottomPanelItems[0]?.id ?? activeBottomPanel);

  const handleResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      const startY = event.clientY;
      const startHeight = bottomPanelHeight;
      const pointerId = event.pointerId;
      const target = event.currentTarget;

      target.setPointerCapture(pointerId);

      const handlePointerMove = (moveEvent: globalThis.PointerEvent): void => {
        setBottomPanelHeight(startHeight + startY - moveEvent.clientY);
      };
      const handlePointerUp = (): void => {
        target.releasePointerCapture(pointerId);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [bottomPanelHeight, setBottomPanelHeight],
  );

  const panelContent = useMemo(() => {
    const contribution = ViewRegistryService.getBottomPanel(activeVisiblePanel);
    if (contribution) {
      const Component = contribution.component;
      return <Component />;
    }
    return <WorkbenchPlaceholder title={activeVisiblePanel} />;
  }, [activeVisiblePanel]);

  if (!isBottomPanelVisible || !featureVisibility.bottomPanel || bottomPanelItems.length === 0) {
    return null;
  }

  return (
    <section
      className="relative col-[3/-1] row-[3] min-h-0 border-t border-line bg-panel flex flex-col"
      style={{ height: bottomPanelHeight }}
    >
      <div
        className="absolute left-0 top-[-5px] z-20 flex h-2 w-full cursor-row-resize items-center justify-center text-subtle hover:text-accent"
        onPointerDown={handleResizePointerDown}
      >
        <GripHorizontal size={14} />
      </div>
      <header className="flex h-8 items-center justify-between border-b border-line bg-ink-900 shrink-0">
        <div className="flex min-w-0 items-center overflow-x-auto no-scrollbar">
          {bottomPanelItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                'h-8 border-r border-line px-3 text-[11px] font-semibold uppercase transition shrink-0',
                activeVisiblePanel === item.id
                  ? 'bg-panel text-readable border-b border-b-accent'
                  : 'text-muted hover:bg-ink-800 hover:text-readable',
              ].join(' ')}
              onClick={() => {
                setActiveBottomPanel(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="mr-1 h-6 px-1.5" onClick={toggleBottomPanel}>
          <ChevronDown size={14} />
        </Button>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden relative bg-panel">{panelContent}</div>
    </section>
  );
};

const isBottomPanelFeatureVisible = (
  panel: WorkbenchBottomPanel,
  visibility: FeatureVisibilityPreferences,
): boolean => {
  if (panel === 'aiEvidence') return visibility.aiEvidence;
  if (panel === 'timeline') return visibility.timeline;
  if (panel === 'diagnostics') return visibility.diagnostics;
  if (panel === 'performance') return visibility.telemetry;
  if (panel === 'watchers') return visibility.watchers;
  return true;
};

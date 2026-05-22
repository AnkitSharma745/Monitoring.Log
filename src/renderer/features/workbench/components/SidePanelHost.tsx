import { GripVertical } from 'lucide-react';
import { useCallback, useMemo, type JSX, type PointerEvent } from 'react';

import { Button } from '@renderer/components/ui/Button';
import { ViewRegistryService } from '@renderer/services/workbenchServices';
import { useWorkbenchStore, type WorkbenchSidePanel } from '../workbenchStore';
import { WorkbenchPlaceholder } from './WorkbenchPlaceholder';

const panelTitles: Record<WorkbenchSidePanel, string> = {
  explorer: 'Explorer',
  search: 'Search',
  watchers: 'Watchers',
  investigations: 'Investigations',
  timeline: 'Timeline',
  knowledge: 'Knowledge Base',
};

export const SidePanelHost = (): JSX.Element | null => {
  const activeSidePanel = useWorkbenchStore((state) => state.activeSidePanel);
  const isSidePanelVisible = useWorkbenchStore((state) => state.isSidePanelVisible);
  const sidePanelWidth = useWorkbenchStore((state) => state.sidePanelWidth);
  const setSidePanelWidth = useWorkbenchStore((state) => state.setSidePanelWidth);
  const toggleSidePanel = useWorkbenchStore((state) => state.toggleSidePanel);

  const handleResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      const startX = event.clientX;
      const startWidth = sidePanelWidth;
      const pointerId = event.pointerId;
      const target = event.currentTarget;

      target.setPointerCapture(pointerId);

      const handlePointerMove = (moveEvent: globalThis.PointerEvent): void => {
        setSidePanelWidth(startWidth + moveEvent.clientX - startX);
      };
      const handlePointerUp = (): void => {
        target.releasePointerCapture(pointerId);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [setSidePanelWidth, sidePanelWidth],
  );

  const content = useMemo(() => {
    const contribution = ViewRegistryService.getSidePanel(activeSidePanel);
    if (contribution) {
      const Component = contribution.component;
      return <Component />;
    }
    return <WorkbenchPlaceholder title={panelTitles[activeSidePanel] || activeSidePanel} />;
  }, [activeSidePanel]);

  if (!isSidePanelVisible) {
    return null;
  }

  const activeTitle =
    ViewRegistryService.getSidePanel(activeSidePanel)?.title ??
    panelTitles[activeSidePanel] ??
    activeSidePanel;

  return (
    <aside
      className="relative row-[2/4] min-w-0 border-r border-line bg-panel flex flex-col"
      style={{ width: sidePanelWidth }}
    >
      <header className="flex h-8 items-center justify-between border-b border-line bg-panel px-2 shrink-0">
        <span className="text-[11px] font-bold uppercase text-subtle">{activeTitle}</span>
        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={toggleSidePanel}>
          Hide
        </Button>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden relative">{content}</div>
      <div
        className="absolute right-[-4px] top-0 z-20 flex h-full w-2 cursor-col-resize items-center justify-center text-subtle hover:text-accent"
        onPointerDown={handleResizePointerDown}
      >
        <GripVertical size={12} />
      </div>
    </aside>
  );
};

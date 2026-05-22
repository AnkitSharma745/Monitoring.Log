import { useEffect, type JSX } from 'react';
import { OverlayHost } from '@renderer/components/ui/OverlayHost';
import { LogViewer } from '@renderer/features/logViewer/components/LogViewer';
import { ActivityBar } from '@renderer/features/workbench/components/ActivityBar';
import { BottomPanelHost } from '@renderer/features/workbench/components/BottomPanelHost';
import { SidePanelHost } from '@renderer/features/workbench/components/SidePanelHost';
import { WorkbenchStatusBar } from '@renderer/features/workbench/components/WorkbenchStatusBar';
import { WorkbenchTopBar } from '@renderer/features/workbench/components/WorkbenchTopBar';
import { useWorkbenchStore } from '@renderer/features/workbench/workbenchStore';
import { CommandService } from '@renderer/services/workbenchServices';
import { SettingsPanel } from './SettingsPanel';

export const AppLayout = (): JSX.Element => {
  const isSidePanelVisible = useWorkbenchStore((state) => state.isSidePanelVisible);
  const sidePanelWidth = useWorkbenchStore((state) => state.sidePanelWidth);
  const gridTemplateColumns = `44px ${isSidePanelVisible ? `${sidePanelWidth}px` : '0px'} minmax(0, 1fr)`;

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent): void => {
      // 1. Command Palette Trigger: Ctrl+Shift+P or F1
      const isCtrlShiftP = event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p';
      const isF1 = event.key === 'F1';

      if (isCtrlShiftP || isF1) {
        event.preventDefault();
        event.stopPropagation();
        void CommandService.executeCommand('workbench.action.openCommandPalette');
        return;
      }

      // 2. Toggle Sidebar Trigger: Ctrl+B
      const isCtrlB =
        event.ctrlKey && event.key.toLowerCase() === 'b' && !event.shiftKey && !event.altKey;
      if (isCtrlB) {
        event.preventDefault();
        event.stopPropagation();
        void CommandService.executeCommand('workbench.action.toggleSidebar');
        return;
      }

      // 3. Toggle Bottom Panel Trigger: Ctrl+` (Ctrl + Backtick)
      const isCtrlBacktick = event.ctrlKey && event.key === '`';
      if (isCtrlBacktick) {
        event.preventDefault();
        event.stopPropagation();
        void CommandService.executeCommand('workbench.action.toggleBottomPanel');
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, []);

  return (
    <main
      className="relative grid h-screen w-screen grid-rows-[36px_minmax(0,1fr)_auto_24px] overflow-hidden border border-line bg-ink-950 text-readable"
      style={{
        gridTemplateColumns,
      }}
    >
      <WorkbenchTopBar />
      <ActivityBar />
      <SidePanelHost />
      <section className="col-3 row-2 flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
        <LogViewer />
      </section>
      <BottomPanelHost />
      <WorkbenchStatusBar />
      <SettingsPanel />
      <OverlayHost />
    </main>
  );
};

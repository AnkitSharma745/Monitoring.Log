import { create } from 'zustand';

export type WorkbenchSidePanel =
  | 'explorer'
  | 'search'
  | 'watchers'
  | 'investigations'
  | 'timeline'
  | 'knowledge';
export type WorkbenchBottomPanel =
  | 'problems'
  | 'activity'
  | 'aiEvidence'
  | 'timeline'
  | 'output'
  | 'performance'
  | 'watchers'
  | 'diagnostics';

export interface WorkbenchLayoutState {
  activeSidePanel: WorkbenchSidePanel;
  isSidePanelVisible: boolean;
  sidePanelWidth: number;
  activeBottomPanel: WorkbenchBottomPanel;
  isBottomPanelVisible: boolean;
  bottomPanelHeight: number;
  setActiveSidePanel: (panel: WorkbenchSidePanel) => void;
  setSidePanelWidth: (width: number) => void;
  toggleSidePanel: () => void;
  setActiveBottomPanel: (panel: WorkbenchBottomPanel) => void;
  setBottomPanelHeight: (height: number) => void;
  toggleBottomPanel: () => void;
}

interface PersistedWorkbenchLayout {
  activeSidePanel: WorkbenchSidePanel;
  isSidePanelVisible: boolean;
  sidePanelWidth: number;
  activeBottomPanel: WorkbenchBottomPanel;
  isBottomPanelVisible: boolean;
  bottomPanelHeight: number;
}

const WORKBENCH_STORAGE_KEY = 'monitoring-log.workbench.v1';
const DEFAULT_SIDE_PANEL_WIDTH = 292;
const DEFAULT_BOTTOM_PANEL_HEIGHT = 188;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(Math.floor(value), min), max);
};

const readPersistedWorkbench = (): PersistedWorkbenchLayout | null => {
  try {
    const rawValue = window.localStorage.getItem(WORKBENCH_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<PersistedWorkbenchLayout>;

    return {
      activeSidePanel: parsedValue.activeSidePanel ?? 'explorer',
      isSidePanelVisible: parsedValue.isSidePanelVisible ?? true,
      sidePanelWidth: clamp(parsedValue.sidePanelWidth ?? DEFAULT_SIDE_PANEL_WIDTH, 220, 520),
      activeBottomPanel: parsedValue.activeBottomPanel ?? 'problems',
      isBottomPanelVisible: parsedValue.isBottomPanelVisible ?? false,
      bottomPanelHeight: clamp(
        parsedValue.bottomPanelHeight ?? DEFAULT_BOTTOM_PANEL_HEIGHT,
        120,
        420,
      ),
    };
  } catch {
    return null;
  }
};

const persistedLayout = readPersistedWorkbench();

export const useWorkbenchStore = create<WorkbenchLayoutState>((set) => ({
  activeSidePanel: persistedLayout?.activeSidePanel ?? 'explorer',
  isSidePanelVisible: persistedLayout?.isSidePanelVisible ?? true,
  sidePanelWidth: persistedLayout?.sidePanelWidth ?? DEFAULT_SIDE_PANEL_WIDTH,
  activeBottomPanel: persistedLayout?.activeBottomPanel ?? 'problems',
  isBottomPanelVisible: persistedLayout?.isBottomPanelVisible ?? false,
  bottomPanelHeight: persistedLayout?.bottomPanelHeight ?? DEFAULT_BOTTOM_PANEL_HEIGHT,

  setActiveSidePanel: (panel): void => {
    set((state) => ({
      activeSidePanel: panel,
      isSidePanelVisible: state.activeSidePanel === panel ? !state.isSidePanelVisible : true,
    }));
  },

  setSidePanelWidth: (width): void => {
    set({ sidePanelWidth: clamp(width, 220, 520) });
  },

  toggleSidePanel: (): void => {
    set((state) => ({ isSidePanelVisible: !state.isSidePanelVisible }));
  },

  setActiveBottomPanel: (panel): void => {
    set((state) => ({
      activeBottomPanel: panel,
      isBottomPanelVisible: state.activeBottomPanel === panel ? !state.isBottomPanelVisible : true,
    }));
  },

  setBottomPanelHeight: (height): void => {
    set({ bottomPanelHeight: clamp(height, 120, 420) });
  },

  toggleBottomPanel: (): void => {
    set((state) => ({ isBottomPanelVisible: !state.isBottomPanelVisible }));
  },
}));

useWorkbenchStore.subscribe((state) => {
  const snapshot: PersistedWorkbenchLayout = {
    activeSidePanel: state.activeSidePanel,
    isSidePanelVisible: state.isSidePanelVisible,
    sidePanelWidth: state.sidePanelWidth,
    activeBottomPanel: state.activeBottomPanel,
    isBottomPanelVisible: state.isBottomPanelVisible,
    bottomPanelHeight: state.bottomPanelHeight,
  };

  try {
    window.localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Layout persistence is best effort only.
  }
});

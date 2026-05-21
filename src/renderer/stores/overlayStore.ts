import { create } from 'zustand';

export interface OverlayStoreState {
  isCommandPaletteOpen: boolean;
  activeDialog: string | null;
  dialogProps: any;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  showDialog: (dialogId: string, props?: any) => void;
  closeDialog: () => void;
}

export const useOverlayStore = create<OverlayStoreState>((set) => ({
  isCommandPaletteOpen: false,
  activeDialog: null,
  dialogProps: null,

  openCommandPalette: (): void => {
    set({ isCommandPaletteOpen: true });
  },

  closeCommandPalette: (): void => {
    set({ isCommandPaletteOpen: false });
  },

  showDialog: (dialogId, props = null): void => {
    set({ activeDialog: dialogId, dialogProps: props });
  },

  closeDialog: (): void => {
    set({ activeDialog: null, dialogProps: null });
  },
}));

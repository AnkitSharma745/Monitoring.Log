import { useEffect } from 'react';

import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

export const useKeyboardShortcuts = (): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isModifierPressed = event.ctrlKey || event.metaKey;
      const store = useFileMonitorStore.getState();
      const activeFilePath = store.selectedFilePath;

      if (event.key === 'Enter' && store.searchQuery.trim().length > 0) {
        event.preventDefault();
        if (event.shiftKey) {
          store.selectPreviousSearchMatch();
        } else {
          store.selectNextSearchMatch();
        }
        return;
      }

      if (!isModifierPressed) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'o' && event.shiftKey) {
        event.preventDefault();
        void store.selectDirectoryFromDialog();
        return;
      }

      if (key === 'o') {
        event.preventDefault();
        void store.selectFilesFromDialog();
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('monitoring-log:focus-search'));
        return;
      }

      if (key === 'l') {
        event.preventDefault();
        store.clearActiveView();
        return;
      }

      if (key === 'w') {
        event.preventDefault();
        if (activeFilePath) {
          store.closeTab(activeFilePath);
        }
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        if (activeFilePath) {
          void store.loadFile(activeFilePath);
        }
        return;
      }

      if (key === 'b') {
        event.preventDefault();
        store.toggleSidebarVisibility();
        return;
      }

      if (event.key === ',') {
        event.preventDefault();
        store.toggleSettingsPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
};

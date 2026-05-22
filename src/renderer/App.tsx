import { useEffect, type JSX } from 'react';
import { AppLayout } from '@renderer/features/layout/components/AppLayout';
import { useKeyboardShortcuts } from '@renderer/features/shortcuts/useKeyboardShortcuts';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';

function App(): JSX.Element {
  const themeMode = useFileMonitorStore((state) => state.themeMode);
  const restoreWorkspace = useFileMonitorStore((state) => state.restoreWorkspace);
  useKeyboardShortcuts();

  useEffect(() => {
    restoreWorkspace();
  }, [restoreWorkspace]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', themeMode === 'dark');
    root.dataset['theme'] = themeMode;
  }, [themeMode]);

  useEffect(() => {
    const removeUpdateListener = window.desktop.files.onFileUpdated((event) => {
      useFileMonitorStore.getState().applyFileUpdate(event);
    });
    const removeErrorListener = window.desktop.files.onWatchError((event) => {
      useFileMonitorStore.getState().applyWatchError(event);
    });

    return () => {
      removeUpdateListener();
      removeErrorListener();
      void useFileMonitorStore.getState().stopAllWatching();
    };
  }, []);

  return <AppLayout />;
}

export default App;

import type { WatchingFileState } from '@renderer/stores/fileMonitorStore';

export type WatcherHealthTone = 'healthy' | 'idle' | 'stale' | 'error';

export interface WatcherHealth {
  tone: WatcherHealthTone;
  label: string;
  detail: string;
}

export const STALE_WATCHER_MS = 5 * 60 * 1000;

export const getWatcherHealth = (watcher: WatchingFileState, now: number): WatcherHealth => {
  if (watcher.lastErrorMessage) {
    return {
      tone: 'error',
      label: 'Error',
      detail: watcher.lastErrorMessage,
    };
  }

  const lastActivityAt = watcher.lastUpdateAt ?? watcher.startedAt;
  const inactiveMs = now - new Date(lastActivityAt).getTime();

  if (inactiveMs >= STALE_WATCHER_MS) {
    return {
      tone: 'stale',
      label: 'Stale',
      detail: 'No updates in the last 5 minutes.',
    };
  }

  if (!watcher.lastUpdateAt) {
    return {
      tone: 'idle',
      label: 'Idle',
      detail: 'Watcher is active and waiting for appended content.',
    };
  }

  return {
    tone: 'healthy',
    label: 'Live',
    detail: 'Recent append activity received.',
  };
};

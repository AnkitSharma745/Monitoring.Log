import { Activity, Clock3, Gauge, HardDrive, RadioTower, ShieldCheck } from 'lucide-react';
import { useMemo, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { formatBytes, formatShortTime } from '@renderer/features/files/fileFormatting';
import { useCurrentTime } from '@renderer/hooks/useCurrentTime';
import { useFileMonitorStore, type WatchingFileState } from '@renderer/stores/fileMonitorStore';

import { getWatcherHealth, type WatcherHealthTone } from '../watcherHealth';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const healthBadgeTone: Record<WatcherHealthTone, BadgeTone> = {
  healthy: 'success',
  idle: 'info',
  stale: 'warning',
  error: 'danger',
};

export const ActivityPanel = (): JSX.Element => {
  const activitySamples = useFileMonitorStore((state) => state.activitySamples);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const documentsByPath = useFileMonitorStore((state) => state.documentsByPath);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const lastUpdate = useFileMonitorStore((state) => state.lastUpdate);
  const currentTime = useCurrentTime();

  const metrics = useMemo(() => {
    const now = currentTime;
    const recentSamples = activitySamples.filter(
      (sample) => now - new Date(sample.receivedAt).getTime() <= 60_000,
    );
    const recentLineCount = recentSamples.reduce((total, sample) => total + sample.lineCount, 0);
    const watcherEntries = getWatcherEntries(watchingFiles);
    const healthCounts = watcherEntries.reduce(
      (counts, entry) => {
        const health = getWatcherHealth(entry.watcher, now);
        counts[health.tone] += 1;
        return counts;
      },
      {
        healthy: 0,
        idle: 0,
        stale: 0,
        error: 0,
      } satisfies Record<WatcherHealthTone, number>,
    );

    return {
      bufferedBytes: Object.values(documentsByPath).reduce(
        (total, document) => total + document.content.length,
        0,
      ),
      bufferedLines: Object.values(documentsByPath).reduce(
        (total, document) => total + document.lineCount,
        0,
      ),
      watcherEntries,
      healthCounts,
      linesPerSecond: recentLineCount / 60,
      updatesPerMinute: recentSamples.length,
    };
  }, [activitySamples, currentTime, documentsByPath, watchingFiles]);

  return (
    <section className="border-b border-line bg-panel-soft px-4 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ActivityMetric
          icon={<RadioTower size={14} />}
          label="Watchers"
          value={metrics.watcherEntries.length.toString()}
          tone={metrics.watcherEntries.length > 0 ? 'success' : 'neutral'}
        />
        <ActivityMetric
          icon={<Gauge size={14} />}
          label="Logs/sec"
          value={metrics.linesPerSecond.toFixed(1)}
          tone={metrics.linesPerSecond > 0 ? 'info' : 'neutral'}
        />
        <ActivityMetric
          icon={<Activity size={14} />}
          label="Updates/min"
          value={metrics.updatesPerMinute.toString()}
          tone={metrics.updatesPerMinute > 0 ? 'success' : 'neutral'}
        />
        <ActivityMetric
          icon={<HardDrive size={14} />}
          label="Buffer"
          value={formatBytes(metrics.bufferedBytes)}
          tone="neutral"
        />
        <ActivityMetric
          icon={<ShieldCheck size={14} />}
          label="Healthy"
          value={metrics.healthCounts.healthy.toString()}
          tone="success"
        />
        <ActivityMetric
          icon={<Clock3 size={14} />}
          label="Stale/Error"
          value={(metrics.healthCounts.stale + metrics.healthCounts.error).toString()}
          tone={metrics.healthCounts.stale + metrics.healthCounts.error > 0 ? 'warning' : 'neutral'}
        />
        {metrics.watcherEntries.slice(0, 3).map(({ filePath, watcher }) => {
          const health = getWatcherHealth(watcher, currentTime);
          const fileName = filesByPath[filePath]?.name ?? filePath;

          return (
            <Badge key={filePath} tone={healthBadgeTone[health.tone]} className="max-w-[220px]">
              <span className="truncate" title={filePath}>
                {fileName}
              </span>
              <span className="text-subtle">
                {watcher.lastUpdateAt
                  ? formatShortTime(watcher.lastUpdateAt)
                  : health.label.toLocaleLowerCase()}
              </span>
            </Badge>
          );
        })}
        {lastUpdate && (
          <span className="truncate text-[11px] text-subtle">
            Latest {lastUpdate.changeType} from{' '}
            {filesByPath[lastUpdate.filePath]?.name ?? lastUpdate.filePath} at{' '}
            {formatShortTime(lastUpdate.changedAt)}
          </span>
        )}
      </div>
      {metrics.healthCounts.error > 0 && (
        <div className="mt-1 text-[11px] text-danger">
          One or more watchers reported errors. Review the source rail or status bar.
        </div>
      )}
    </section>
  );
};

interface ActivityMetricProps {
  icon: JSX.Element;
  label: string;
  value: string;
  tone: BadgeTone;
}

const metricToneClasses: Record<BadgeTone, string> = {
  neutral: 'text-readable',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const ActivityMetric = ({ icon, label, value, tone }: ActivityMetricProps): JSX.Element => {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-ink-950/60 px-2 text-[11px]">
      <span className="text-subtle">{icon}</span>
      <span className={metricToneClasses[tone]}>{value}</span>
      <span className="text-subtle">{label}</span>
    </span>
  );
};

interface WatcherEntry {
  filePath: string;
  watcher: WatchingFileState;
}

const getWatcherEntries = (watchingFiles: Record<string, WatchingFileState>): WatcherEntry[] => {
  return Object.keys(watchingFiles).flatMap((filePath) => {
    const watcher = watchingFiles[filePath];

    return watcher ? [{ filePath, watcher }] : [];
  });
};

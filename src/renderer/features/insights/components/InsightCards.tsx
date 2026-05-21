import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';

import { Badge } from '@renderer/components/ui/Badge';

import type { LogInsight, LogInsightTone } from '../logInsights';
import type { JSX } from 'react';

interface InsightCardsProps {
  insights: LogInsight[];
}

const toneClasses: Record<LogInsightTone, string> = {
  danger: 'border-danger/40 bg-danger-soft text-danger',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  info: 'border-info/40 bg-info-soft text-info',
};

const badgeTone: Record<LogInsightTone, 'danger' | 'warning' | 'info'> = {
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};

export const InsightCards = ({ insights }: InsightCardsProps): JSX.Element => {
  if (insights.length === 0) {
    return <></>;
  }

  return (
    <section className="border-b border-line bg-panel-soft px-4 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${toneClasses[insight.tone]}`}
          >
            <InsightIcon tone={insight.tone} />
            <span className="truncate font-semibold">{insight.title}</span>
            <Badge tone={badgeTone[insight.tone]}>{insight.count}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
};

interface InsightIconProps {
  tone: LogInsightTone;
}

const InsightIcon = ({ tone }: InsightIconProps): JSX.Element => {
  if (tone === 'danger') {
    return <ShieldAlert size={15} />;
  }

  if (tone === 'warning') {
    return <AlertTriangle size={15} />;
  }

  return <Info size={15} />;
};

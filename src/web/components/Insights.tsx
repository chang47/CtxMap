import type { MassAggregation, InsightPattern } from '../../core/types';

interface InsightsProps {
  data: MassAggregation;
}

const severityColors = {
  warning: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
    badge: 'bg-red-100 text-red-700',
  },
  notice: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700',
  },
};

const typeIcons: Record<InsightPattern['type'], string> = {
  frequent_file: '📄',
  test_churn: '🔄',
  context_bloat: '📊',
  long_session: '⏱️',
  high_churn: '✏️',
};

const typeLabels: Record<InsightPattern['type'], string> = {
  frequent_file: 'Frequent File',
  test_churn: 'Test Churn',
  context_bloat: 'Context Bloat',
  long_session: 'Long Session',
  high_churn: 'High Churn',
};

export function Insights({ data }: InsightsProps) {
  const { insights } = data;

  // Group insights by severity
  const warnings = insights.filter((i) => i.severity === 'warning');
  const notices = insights.filter((i) => i.severity === 'notice');
  const infos = insights.filter((i) => i.severity === 'info');

  if (insights.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-4xl mb-4">✨</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">All Good!</h3>
        <p className="text-gray-500">No significant patterns or issues detected in your sessions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-semibold text-red-700">{warnings.length}</div>
          <div className="text-sm text-red-600">Warnings</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-semibold text-amber-700">{notices.length}</div>
          <div className="text-sm text-amber-600">Notices</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-semibold text-blue-700">{infos.length}</div>
          <div className="text-sm text-blue-600">Info</div>
        </div>
      </div>

      {/* Insights List */}
      <div className="space-y-4">
        {insights.map((insight, idx) => (
          <InsightCard key={idx} insight={insight} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: InsightPattern }) {
  const colors = severityColors[insight.severity];
  const icon = typeIcons[insight.type];
  const label = typeLabels[insight.type];

  return (
    <div className={`rounded-lg border ${colors.bg} ${colors.border} p-4`}>
      <div className="flex items-start gap-4">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>{label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>
              {insight.severity}
            </span>
          </div>
          <h3 className="text-sm font-medium text-gray-900">{insight.description}</h3>
          <p className="text-sm text-gray-600 mt-1">{insight.recommendation}</p>
          {insight.affectedSessions > 0 && (
            <div className="text-xs text-gray-500 mt-2">
              Affects {insight.affectedSessions} session{insight.affectedSessions !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

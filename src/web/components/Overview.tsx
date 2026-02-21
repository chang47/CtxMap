import type { MassAggregation } from '../../core/types';

interface OverviewProps {
  data: MassAggregation;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function Overview({ data }: OverviewProps) {
  const totalTokens = data.totalInputTokens + data.totalOutputTokens;
  const cacheHitRate = data.totalInputTokens > 0
    ? (data.totalCacheRead / data.totalInputTokens) * 100
    : 0;

  const stats = [
    { label: 'Sessions', value: data.totalSessions.toString(), color: 'bg-blue-500' },
    { label: 'Total Turns', value: data.totalTurns.toString(), color: 'bg-indigo-500' },
    { label: 'Total Cost', value: formatCost(data.totalCost), color: 'bg-green-500' },
    { label: 'Total Tokens', value: formatTokens(totalTokens), color: 'bg-purple-500' },
  ];

  const tokenBreakdown = [
    { label: 'Input', value: formatTokens(data.totalInputTokens), percent: formatPercent((data.totalInputTokens / totalTokens) * 100) },
    { label: 'Output', value: formatTokens(data.totalOutputTokens), percent: formatPercent((data.totalOutputTokens / totalTokens) * 100) },
    { label: 'Cache Creation', value: formatTokens(data.totalCacheCreation), percent: formatPercent((data.totalCacheCreation / totalTokens) * 100) },
    { label: 'Cache Read', value: formatTokens(data.totalCacheRead), percent: formatPercent((data.totalCacheRead / totalTokens) * 100) },
  ];

  return (
    <div className="space-y-8">
      {/* Date Range */}
      <div className="text-sm text-gray-500">
        Data from <span className="font-medium text-gray-700">{data.startDate}</span> to{' '}
        <span className="font-medium text-gray-700">{data.endDate}</span>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${stat.color}`}></div>
              <span className="text-sm text-gray-500">{stat.label}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Token Breakdown */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Token Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tokenBreakdown.map((item) => (
            <div key={item.label} className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-lg font-semibold text-gray-900">{item.value}</div>
              <div className="text-sm text-gray-500">{item.label}</div>
              <div className="text-xs text-gray-400 mt-1">{item.percent}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cache Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Cache Performance</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Cache Hit Rate</span>
              <span className="font-medium">{formatPercent(cacheHitRate)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-primary-600 h-3 rounded-full transition-all"
                style={{ width: `${Math.min(cacheHitRate, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Cache read tokens: {formatTokens(data.totalCacheRead)} saved from re-processing
        </p>
      </div>

      {/* Projects */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects ({data.projects.length})</h2>
        <div className="space-y-3">
          {data.projects.slice(0, 5).map((project) => (
            <div key={project.projectPath} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-700 truncate max-w-md">{project.projectPath}</span>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">{project.sessionCount} sessions</span>
                <span className="font-medium text-gray-900">{formatCost(project.totalCost)}</span>
              </div>
            </div>
          ))}
          {data.projects.length > 5 && (
            <div className="text-sm text-gray-500 pt-2">
              +{data.projects.length - 5} more projects
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

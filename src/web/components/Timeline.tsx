import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import type { MassAggregation } from '../../core/types';

interface TimelineProps {
  data: MassAggregation;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return tokens.toString();
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function Timeline({ data }: TimelineProps) {
  // Prepare data for charts
  const dailyData = data.dailyTotals.map((day) => ({
    ...day,
    displayDate: day.date.slice(5), // MM-DD format
    inputTokensK: Math.round(day.inputTokens / 1000),
    outputTokensK: Math.round(day.outputTokens / 1000),
  }));

  // Calculate weekly aggregates
  const weeklyMap = new Map<string, { sessions: number; cost: number; inputTokens: number; outputTokens: number; week: string }>();
  for (const day of data.dailyTotals) {
    const date = new Date(day.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);

    const existing = weeklyMap.get(weekKey);
    if (existing) {
      existing.sessions += day.sessions;
      existing.cost += day.cost;
      existing.inputTokens += day.inputTokens;
      existing.outputTokens += day.outputTokens;
    } else {
      weeklyMap.set(weekKey, {
        sessions: day.sessions,
        cost: day.cost,
        inputTokens: day.inputTokens,
        outputTokens: day.outputTokens,
        week: `W${Math.ceil((date.getMonth() + 1) * 4 + date.getDate() / 7)}`,
      });
    }
  }

  const weeklyData = Array.from(weeklyMap.values())
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-8); // Last 8 weeks

  return (
    <div className="space-y-8">
      {/* Weekly Cost Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Weekly Cost</h2>
        {weeklyData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value) => [formatCost(Number(value) || 0), 'Cost']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="cost" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            Not enough data for weekly chart
          </div>
        )}
      </div>

      {/* Daily Token Trends */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Token Trends</h2>
        {dailyData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => `${v}K`} />
                <Tooltip
                  formatter={(value, name) => [formatTokens((Number(value) || 0) * 1000), String(name)]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="inputTokensK"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                  name="Input"
                />
                <Line
                  type="monotone"
                  dataKey="outputTokensK"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="Output"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No daily data available
          </div>
        )}
      </div>

      {/* Session Count Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sessions per Day</h2>
        {dailyData.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="sessions" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-500">
            No daily data available
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">Avg Sessions/Day</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">
            {data.dailyTotals.length > 0
              ? (data.totalSessions / data.dailyTotals.length).toFixed(1)
              : '0'}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">Avg Cost/Session</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">
            {formatCost(data.totalSessions > 0 ? data.totalCost / data.totalSessions : 0)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">Peak Context</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">
            {formatTokens(Math.max(...data.dailyTotals.map((d) => d.peakContext), 0))}
          </div>
        </div>
      </div>
    </div>
  );
}

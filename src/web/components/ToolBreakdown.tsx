import { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { MassAggregation } from '../../core/types';

interface ToolBreakdownProps {
  data: MassAggregation;
}

const COLORS = [
  '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6',
];

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)}MB`;
  }
  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)}KB`;
  }
  return `${bytes}B`;
}

export function ToolBreakdown({ data }: ToolBreakdownProps) {
  const [view, setView] = useState<'count' | 'tokens' | 'bytes'>('count');

  // Prepare pie chart data (top 8 tools + others)
  const totalContext = data.aggregatedToolStats.reduce((sum, t) => sum + t.totalContextTokens, 0);
  const totalCount = data.aggregatedToolStats.reduce((sum, t) => sum + t.totalCount, 0);
  const totalBytes = data.aggregatedToolStats.reduce((sum, t) => sum + t.totalOutputBytes, 0);

  const topTools = data.aggregatedToolStats.slice(0, 8);
  const others = data.aggregatedToolStats.slice(8);
  const othersTotal = others.reduce((sum, t) => sum + t.totalContextTokens, 0);
  const othersCount = others.reduce((sum, t) => sum + t.totalCount, 0);
  const othersBytes = others.reduce((sum, t) => sum + t.totalOutputBytes, 0);

  const pieData = [
    ...topTools.map((t) => ({
      name: t.toolName,
      value: view === 'count' ? t.totalCount : view === 'tokens' ? t.totalContextTokens : t.totalOutputBytes,
    })),
    ...(others.length > 0
      ? [{ name: 'Others', value: view === 'count' ? othersCount : view === 'tokens' ? othersTotal : othersBytes }]
      : []),
  ];

  // Bar chart data (top 10 by count)
  const barData = data.aggregatedToolStats.slice(0, 10).map((t) => ({
    name: t.toolName.length > 10 ? t.toolName.slice(0, 10) + '...' : t.toolName,
    count: t.totalCount,
    tokens: Math.round(t.totalContextTokens / 1000),
    sessions: t.sessionCount,
  }));

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-2">
          {(['count', 'tokens', 'bytes'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                view === v
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">Total Tool Calls</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{totalCount.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">Total Context Tokens</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{formatTokens(totalContext)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">Total Output Size</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{formatBytes(totalBytes)}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tool Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    view === 'count'
                      ? Number(value).toLocaleString()
                      : view === 'tokens'
                      ? formatTokens(Number(value) || 0)
                      : formatBytes(Number(value) || 0),
                    'Value',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {pieData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-1 text-xs">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                ></div>
                <span className="text-gray-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Tools by Count</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="#9ca3af" width={80} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Legend />
                <Bar dataKey="count" fill="#0ea5e9" name="Calls" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tool Details Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Tool Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tool</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calls</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Context Tokens</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Output Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session %</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.aggregatedToolStats.slice(0, 20).map((tool) => (
                <tr key={tool.toolName} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{tool.toolName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{tool.totalCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{tool.sessionCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatTokens(tool.totalContextTokens)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatBytes(tool.totalOutputBytes)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{tool.sessionPercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

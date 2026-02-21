import type { ReactNode } from 'react';

type Tab = 'overview' | 'timeline' | 'files' | 'tools' | 'insights';

interface LayoutProps {
  children: ReactNode;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  liveMode?: boolean;
  onLiveModeChange?: (live: boolean) => void;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'files', label: 'Files' },
  { id: 'tools', label: 'Tools' },
  { id: 'insights', label: 'Insights' },
];

export function Layout({
  children,
  activeTab,
  onTabChange,
  liveMode = false,
  onLiveModeChange,
  lastUpdated,
  onRefresh,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">CtxMap</h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Live mode toggle */}
              {onLiveModeChange && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onLiveModeChange(!liveMode)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      liveMode ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    title={liveMode ? 'Live mode on - auto-refresh every 5s' : 'Live mode off'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        liveMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-600">
                    {liveMode ? 'Live' : 'Paused'}
                  </span>
                </div>
              )}

              {/* Refresh button */}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Refresh data"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}

              {/* Last updated timestamp */}
              {lastUpdated && (
                <div className="text-xs text-gray-400">
                  Updated {lastUpdated.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

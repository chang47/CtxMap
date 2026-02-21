import { useState } from 'react';
import { useAggregation } from './hooks/useAggregation';
import { Layout } from './components/Layout';
import { Overview } from './components/Overview';
import { Timeline } from './components/Timeline';
import { FileTable } from './components/FileTable';
import { ToolBreakdown } from './components/ToolBreakdown';
import { Insights } from './components/Insights';

type Tab = 'overview' | 'timeline' | 'files' | 'tools' | 'insights';

export default function App() {
  const { data, loading, error } = useAggregation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading session data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-2">Error loading data</div>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No data available</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview data={data} />;
      case 'timeline':
        return <Timeline data={data} />;
      case 'files':
        return <FileTable data={data} />;
      case 'tools':
        return <ToolBreakdown data={data} />;
      case 'insights':
        return <Insights data={data} />;
      default:
        return <Overview data={data} />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

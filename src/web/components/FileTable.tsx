import { useState, useMemo } from 'react';
import type { MassAggregation, FileInteractionPattern } from '../../core/types';

interface FileTableProps {
  data: MassAggregation;
}

type SortKey = 'filePath' | 'readCount' | 'editCount' | 'writeCount' | 'totalInteractions' | 'sessionCount';
type SortDir = 'asc' | 'desc';

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)}MB`;
  }
  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)}KB`;
  }
  return `${bytes}B`;
}

function shortenPath(path: string): string {
  const parts = path.split(/[/\\]/);
  if (parts.length <= 2) return path;
  return '.../' + parts.slice(-2).join('/');
}

export function FileTable({ data }: FileTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('totalInteractions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState('');
  const [toolFilter, setToolFilter] = useState<'all' | 'read' | 'edit' | 'write'>('all');

  const sortedFiles = useMemo(() => {
    let files = [...data.fileInteractionPatterns];

    // Apply search filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      files = files.filter((f) => f.filePath.toLowerCase().includes(lowerFilter));
    }

    // Apply tool filter
    if (toolFilter === 'read') {
      files = files.filter((f) => f.readCount > 0);
    } else if (toolFilter === 'edit') {
      files = files.filter((f) => f.editCount > 0);
    } else if (toolFilter === 'write') {
      files = files.filter((f) => f.writeCount > 0);
    }

    // Sort
    files.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return files;
  }, [data.fileInteractionPatterns, sortKey, sortDir, filter, toolFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
      onClick={() => handleSort(sortKeyValue)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === sortKeyValue && (
          <span className="text-primary-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <input
              type="text"
              placeholder="Search files..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'read', 'edit', 'write'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setToolFilter(type)}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  toolFilter === type
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Files</div>
          <div className="text-xl font-semibold">{data.fileInteractionPatterns.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Reads</div>
          <div className="text-xl font-semibold">
            {data.fileInteractionPatterns.reduce((sum, f) => sum + f.readCount, 0)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Edits</div>
          <div className="text-xl font-semibold">
            {data.fileInteractionPatterns.reduce((sum, f) => sum + f.editCount, 0)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Writes</div>
          <div className="text-xl font-semibold">
            {data.fileInteractionPatterns.reduce((sum, f) => sum + f.writeCount, 0)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="File" sortKeyValue="filePath" />
                <SortHeader label="Read" sortKeyValue="readCount" />
                <SortHeader label="Edit" sortKeyValue="editCount" />
                <SortHeader label="Write" sortKeyValue="writeCount" />
                <SortHeader label="Total" sortKeyValue="totalInteractions" />
                <SortHeader label="Sessions" sortKeyValue="sessionCount" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedFiles.slice(0, 50).map((file, idx) => (
                <FileRow key={`${file.filePath}-${idx}`} file={file} />
              ))}
            </tbody>
          </table>
        </div>
        {sortedFiles.length > 50 && (
          <div className="px-4 py-3 bg-gray-50 text-sm text-gray-500 text-center">
            Showing 50 of {sortedFiles.length} files
          </div>
        )}
        {sortedFiles.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500">
            No files match the current filters
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({ file }: { file: FileInteractionPattern }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 text-sm text-gray-900">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">{expanded ? '▼' : '▶'}</span>
            <span className="font-mono text-xs" title={file.filePath}>
              {shortenPath(file.filePath)}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">{file.readCount}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{file.editCount}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{file.writeCount}</td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{file.totalInteractions}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{file.sessionCount}</td>
        <td className="px-4 py-3 text-sm text-gray-500">{formatBytes(file.totalSizeBytes)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-3 text-sm">
            <div className="space-y-2">
              <div>
                <span className="text-gray-500">Full path:</span>{' '}
                <span className="font-mono text-xs">{file.filePath}</span>
              </div>
              <div>
                <span className="text-gray-500">Session %:</span>{' '}
                <span>{file.sessionPercent.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-gray-500">Projects:</span>{' '}
                <span>{file.projects.join(', ') || 'N/A'}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

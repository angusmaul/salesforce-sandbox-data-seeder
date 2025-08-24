import React, { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  ClockIcon,
  CpuChipIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CacheIcon,
  BoltIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

interface PerformanceMetrics {
  timeWindow: string;
  operations: {
    [operation: string]: {
      count: number;
      totalDuration: number;
      avgDuration: number;
      successRate: number;
      totalTokens: number;
      totalCost: number;
      cacheHitRate: number;
    };
  };
  system: {
    avgCpuUsage: number;
    avgMemoryUsage: number;
    peakMemoryUsage: number;
  };
  errors: Array<{
    operation: string;
    error: string;
    count: number;
    lastOccurrence: number;
  }>;
}

interface CostMetrics {
  daily: {
    cost: number;
    tokens: number;
    operations: number;
    budget: number;
    remaining: number;
    percentUsed: number;
  };
  monthly: {
    cost: number;
    tokens: number;
    operations: number;
    budget: number;
    remaining: number;
    percentUsed: number;
  };
  alerts: Array<{
    type: 'warning' | 'critical' | 'exceeded';
    message: string;
    currentCost: number;
    budgetLimit: number;
    timestamp: number;
  }>;
  breakdown: Array<{
    operation: string;
    cost: number;
    tokens: number;
    avgCostPerOperation: number;
  }>;
}

interface CacheStats {
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalSize: number;
  entriesCount: number;
  memoryUsageMB: number;
  config: {
    maxSize: number;
    maxMemoryMB: number;
    defaultTTL: number;
  };
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  heapUsed: number;
  heapTotal: number;
  timestamp: number;
}

export default function PerformanceDashboard() {
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [costMetrics, setCostMetrics] = useState<CostMetrics | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState('1h');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);

      // Fetch performance metrics
      const perfResponse = await fetch(`http://localhost:3001/api/ai/performance-metrics?window=${timeWindow}`);
      if (perfResponse.ok) {
        const perfData = await perfResponse.json();
        setPerformanceMetrics(perfData);
      }

      // Fetch cost metrics
      const costResponse = await fetch('http://localhost:3001/api/ai/cost-metrics');
      if (costResponse.ok) {
        const costData = await costResponse.json();
        setCostMetrics(costData);
      }

      // Fetch cache stats
      const cacheResponse = await fetch('http://localhost:3001/api/ai/cache-stats');
      if (cacheResponse.ok) {
        const cacheData = await cacheResponse.json();
        setCacheStats(cacheData);
      }

      // Fetch system metrics
      const systemResponse = await fetch('http://localhost:3001/api/ai/system-metrics');
      if (systemResponse.ok) {
        const systemData = await systemResponse.json();
        setSystemMetrics(systemData);
      }

      // Fetch recommendations
      const recResponse = await fetch('http://localhost:3001/api/ai/recommendations');
      if (recResponse.ok) {
        const recData = await recResponse.json();
        setRecommendations(recData);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch performance metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [timeWindow]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount);
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getBudgetStatus = (percentUsed: number): { color: string; icon: JSX.Element } => {
    if (percentUsed >= 100) {
      return { color: 'text-red-600 bg-red-100', icon: <XCircleIcon className="h-5 w-5" /> };
    } else if (percentUsed >= 80) {
      return { color: 'text-amber-600 bg-amber-100', icon: <ExclamationTriangleIcon className="h-5 w-5" /> };
    }
    return { color: 'text-green-600 bg-green-100', icon: <CheckCircleIcon className="h-5 w-5" /> };
  };

  if (loading && !performanceMetrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Loading performance metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Performance Dashboard</h2>
          <p className="text-gray-600">Monitor AI operations, costs, and system performance</p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
          </select>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdate && (
        <div className="text-sm text-gray-500">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Cache Hit Rate */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <CacheIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Cache Hit Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {cacheStats ? Math.round(cacheStats.hitRate * 100) : 0}%
              </p>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {cacheStats ? `${formatNumber(cacheStats.hits)}/${formatNumber(cacheStats.totalRequests)} requests` : 'No data'}
          </div>
        </div>

        {/* Average Response Time */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <ClockIcon className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
              <p className="text-2xl font-bold text-gray-900">
                {performanceMetrics ? 
                  Math.round(Object.values(performanceMetrics.operations).reduce((sum, op) => sum + op.avgDuration, 0) / Object.keys(performanceMetrics.operations).length) || 0
                  : 0}ms
              </p>
            </div>
          </div>
        </div>

        {/* Daily Cost */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <CurrencyDollarIcon className="h-8 w-8 text-purple-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Daily Cost</p>
              <p className="text-2xl font-bold text-gray-900">
                {costMetrics ? formatCurrency(costMetrics.daily.cost) : '$0.00'}
              </p>
            </div>
          </div>
          <div className="mt-2">
            {costMetrics && (
              <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getBudgetStatus(costMetrics.daily.percentUsed).color}`}>
                {getBudgetStatus(costMetrics.daily.percentUsed).icon}
                <span className="ml-1">{Math.round(costMetrics.daily.percentUsed)}% of budget</span>
              </div>
            )}
          </div>
        </div>

        {/* System Memory */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <CpuChipIcon className="h-8 w-8 text-orange-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Memory Usage</p>
              <p className="text-2xl font-bold text-gray-900">
                {performanceMetrics ? Math.round(performanceMetrics.system.avgMemoryUsage) : 0}MB
              </p>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Peak: {performanceMetrics ? Math.round(performanceMetrics.system.peakMemoryUsage) : 0}MB
          </div>
        </div>
      </div>

      {/* Budget Alerts */}
      {costMetrics && costMetrics.alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-amber-900 mb-3">Budget Alerts</h3>
          <div className="space-y-2">
            {costMetrics.alerts.slice(0, 3).map((alert, index) => (
              <div key={index} className="flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mr-2" />
                <span className="text-amber-800">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operations Performance */}
      {performanceMetrics && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Operation Performance ({performanceMetrics.timeWindow})</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operation</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requests</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cache Hit Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(performanceMetrics.operations).map(([operation, stats]) => (
                  <tr key={operation}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{operation}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatNumber(stats.count)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{Math.round(stats.avgDuration)}ms</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        stats.successRate >= 0.95 ? 'bg-green-100 text-green-800' : 
                        stats.successRate >= 0.80 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {Math.round(stats.successRate * 100)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {Math.round(stats.cacheHitRate * 100)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(stats.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      {costMetrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Cost Breakdown</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Daily Usage</span>
                <div className="text-right">
                  <div className="text-lg font-medium text-gray-900">{formatCurrency(costMetrics.daily.cost)}</div>
                  <div className="text-xs text-gray-500">of {formatCurrency(costMetrics.daily.budget)}</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    costMetrics.daily.percentUsed >= 100 ? 'bg-red-600' :
                    costMetrics.daily.percentUsed >= 80 ? 'bg-amber-600' : 'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(costMetrics.daily.percentUsed, 100)}%` }}
                />
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Monthly Usage</span>
                <div className="text-right">
                  <div className="text-lg font-medium text-gray-900">{formatCurrency(costMetrics.monthly.cost)}</div>
                  <div className="text-xs text-gray-500">of {formatCurrency(costMetrics.monthly.budget)}</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    costMetrics.monthly.percentUsed >= 90 ? 'bg-red-600' :
                    costMetrics.monthly.percentUsed >= 70 ? 'bg-amber-600' : 'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(costMetrics.monthly.percentUsed, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Cache Statistics</h3>
            {cacheStats ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Hit Rate:</span>
                  <span className="text-sm font-medium text-gray-900">{Math.round(cacheStats.hitRate * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Entries:</span>
                  <span className="text-sm font-medium text-gray-900">{formatNumber(cacheStats.entriesCount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Memory Usage:</span>
                  <span className="text-sm font-medium text-gray-900">{Math.round(cacheStats.memoryUsageMB)}MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Max Size:</span>
                  <span className="text-sm font-medium text-gray-900">{formatNumber(cacheStats.config.maxSize)} entries</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Cache not available</p>
            )}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-blue-900 mb-3 flex items-center">
            <BoltIcon className="h-5 w-5 mr-2" />
            Performance Recommendations
          </h3>
          <ul className="space-y-2">
            {recommendations.map((rec, index) => (
              <li key={index} className="flex items-start">
                <ShieldCheckIcon className="h-4 w-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-blue-800 text-sm">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Errors */}
      {performanceMetrics && performanceMetrics.errors.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Errors</h3>
          <div className="space-y-3">
            {performanceMetrics.errors.slice(0, 5).map((error, index) => (
              <div key={index} className="flex items-start p-3 bg-red-50 rounded-lg">
                <XCircleIcon className="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-900">{error.operation}</p>
                  <p className="text-sm text-red-700">{error.error}</p>
                  <p className="text-xs text-red-600 mt-1">
                    {error.count} occurrences, last: {new Date(error.lastOccurrence).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
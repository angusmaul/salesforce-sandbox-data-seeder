import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { 
  ArrowLeftIcon,
  ServerIcon,
  SignalIcon,
  ClockIcon,
  UserGroupIcon,
  ChartBarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface SystemHealth {
  status: string;
  timestamp: string;
  version: string;
  uptime?: string;
}

interface SessionInfo {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
}

export default function MonitoringPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [sessions, setSessions] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchData = async () => {
    try {
      // Fetch system health
      const healthResponse = await fetch('/api/health');
      const healthData = await healthResponse.json();
      setHealth(healthData);

      // Fetch session information
      const sessionsResponse = await fetch('/api/sessions/list');
      const sessionsData = await sessionsResponse.json();
      
      if (sessionsData.success) {
        const sessions = sessionsData.data || [];
        setSessions({
          totalSessions: sessions.length,
          activeSessions: sessions.filter((s: any) => s.currentStep !== 'results' && s.currentStep !== 'authentication').length,
          completedSessions: sessions.filter((s: any) => s.completed || s.currentStep === 'results').length
        });
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return 'text-green-600 bg-green-100';
      case 'unhealthy':
        return 'text-red-600 bg-red-100';
      case 'warning':
        return 'text-amber-600 bg-amber-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return <CheckCircleIcon className="h-5 w-5" />;
      case 'unhealthy':
        return <XCircleIcon className="h-5 w-5" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-5 w-5" />;
      default:
        return <SignalIcon className="h-5 w-5" />;
    }
  };

  return (
    <>
      <Head>
        <title>System Monitoring - Salesforce Sandbox Data Seeder</title>
        <meta name="description" content="System health and monitoring dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <Link 
                  href="/"
                  className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <ArrowLeftIcon className="h-5 w-5 mr-2" />
                  Back to Home
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">System Monitoring</h1>
              <div className="flex items-center text-sm text-gray-500">
                <ClockIcon className="h-4 w-4 mr-1" />
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading system status...</p>
            </div>
          ) : (
            <>
              {/* System Health Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center">
                    <ServerIcon className="h-8 w-8 text-blue-600 mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
                      {health && (
                        <div className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-medium ${getStatusColor(health.status)}`}>
                          {getStatusIcon(health.status)}
                          <span className="ml-1 capitalize">{health.status}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center">
                    <ChartBarIcon className="h-8 w-8 text-green-600 mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Version</h3>
                      <p className="text-2xl font-bold text-green-600">
                        {health?.version || 'Unknown'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center">
                    <UserGroupIcon className="h-8 w-8 text-purple-600 mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Total Sessions</h3>
                      <p className="text-2xl font-bold text-purple-600">
                        {sessions?.totalSessions || 0}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center">
                    <SignalIcon className="h-8 w-8 text-amber-600 mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Active Sessions</h3>
                      <p className="text-2xl font-bold text-amber-600">
                        {sessions?.activeSessions || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Information */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* System Details */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">System Information</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className="font-medium capitalize">{health?.status || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Version:</span>
                      <span className="font-medium">{health?.version || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Check:</span>
                      <span className="font-medium">
                        {health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'Never'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Frontend:</span>
                      <span className="font-medium text-green-600">Running (Port 3000)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Backend:</span>
                      <span className="font-medium text-green-600">Running (Port 3001)</span>
                    </div>
                  </div>
                </div>

                {/* Session Statistics */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">Session Statistics</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Sessions:</span>
                      <span className="font-medium">{sessions?.totalSessions || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Active Sessions:</span>
                      <span className="font-medium text-amber-600">{sessions?.activeSessions || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Completed Sessions:</span>
                      <span className="font-medium text-green-600">{sessions?.completedSessions || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Success Rate:</span>
                      <span className="font-medium">
                        {sessions?.totalSessions && sessions.totalSessions > 0
                          ? `${Math.round((sessions.completedSessions / sessions.totalSessions) * 100)}%`
                          : 'N/A'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Endpoints */}
              <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Service Endpoints</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">Frontend</h4>
                    <p className="text-sm text-gray-600">http://localhost:3000</p>
                    <p className="text-sm text-gray-600">http://localhost:3000/wizard</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">Backend API</h4>
                    <p className="text-sm text-gray-600">http://localhost:3001/api</p>
                    <p className="text-sm text-gray-600">http://localhost:3001/api/health</p>
                  </div>
                </div>
              </div>

              {/* Refresh Button */}
              <div className="mt-8 text-center">
                <button
                  onClick={fetchData}
                  className="btn-outline"
                  disabled={loading}
                >
                  {loading ? 'Refreshing...' : 'Refresh Status'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
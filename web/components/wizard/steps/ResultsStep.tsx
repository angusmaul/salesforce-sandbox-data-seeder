import React, { useState, useEffect } from 'react';
import { WizardSession, WizardStep } from '../../../shared/types/api';
import { Socket } from 'socket.io-client';
import SummaryCards from '../../results/SummaryCards';
import Charts from '../../results/Charts';
import ErrorAnalysis from '../../results/ErrorAnalysis';
import { Download, RefreshCw, Home } from 'lucide-react';

interface ResultsStepProps {
  session: WizardSession;
  onNext?: (step: WizardStep) => void;
  onPrevious: (step: WizardStep) => void;
  socket?: Socket | null;
}

interface ResultsData {
  summary: any;
  sessionInfo: any;
  objectResults: any[];
  chartData: any;
  errorAnalysis: any;
  performance: any;
}

export default function ResultsStep({ 
  session, 
  onPrevious,
  socket 
}: ResultsStepProps) {
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadSessionId, setLoadSessionId] = useState<string | null>(null);

  // Initialize loadSessionId from session (persisted from ExecutionStep) or listen for socket event
  useEffect(() => {
    if (session.loadSessionId) {
      console.log('Loading existing loadSessionId from session:', session.loadSessionId);
      setLoadSessionId(session.loadSessionId);
    }
  }, [session.loadSessionId]);

  // Listen for execution completion (fallback if session data not available)
  useEffect(() => {
    if (socket && !loadSessionId) {
      const handleExecutionComplete = (data: any) => {
        console.log('Execution completed via socket:', data);
        if (data.loadSessionId) {
          setLoadSessionId(data.loadSessionId);
        }
      };

      socket.on('execution-complete', handleExecutionComplete);
      
      return () => {
        socket.off('execution-complete', handleExecutionComplete);
      };
    }
  }, [socket, loadSessionId]);

  // Fetch results data when loadSessionId is available
  useEffect(() => {
    if (loadSessionId && session.id) {
      fetchResultsData();
    }
  }, [loadSessionId, session.id]);

  const fetchResultsData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/results/${session.id}?loadSessionId=${loadSessionId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch results data');
      }
      
      setResultsData(data.data);
    } catch (err) {
      console.error('Error fetching results:', err);
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadLogs = () => {
    if (loadSessionId) {
      window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/logs/download/${loadSessionId}`, '_blank');
    }
  };

  const handleExportResults = () => {
    if (resultsData && loadSessionId) {
      const exportData = {
        sessionId: loadSessionId,
        timestamp: new Date().toISOString(),
        summary: resultsData.summary,
        sessionInfo: resultsData.sessionInfo,
        performance: resultsData.performance
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `results_${loadSessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading Results...</h2>
            <p className="text-gray-600">Analyzing your data loading results</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error Loading Results</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <div className="flex space-x-3">
            <button 
              onClick={fetchResultsData}
              className="btn-outline text-sm"
            >
              <RefreshCw size={16} className="mr-2" />
              Retry
            </button>
            <button onClick={() => onPrevious('execution')} className="btn-outline text-sm">
              Back to Execution
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!resultsData) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-2">No Results Available</h2>
          <p className="text-amber-700 mb-4">No results data found. Please run the data generation process first.</p>
          <button onClick={() => onPrevious('execution')} className="btn-outline">
            Back to Execution
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Results & Analysis</h1>
          <p className="text-gray-600 mt-1">
            Complete analysis of your data loading process
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleDownloadLogs}
            className="btn-outline text-sm"
          >
            <Download size={16} className="mr-2" />
            Download All Logs
          </button>
          <button
            onClick={handleExportResults}
            className="btn-outline text-sm"
          >
            <Download size={16} className="mr-2" />
            Export Results
          </button>
        </div>
      </div>

      {/* Executive Summary Cards */}
      <SummaryCards 
        summary={resultsData.summary}
        sessionInfo={resultsData.sessionInfo}
        totalObjects={resultsData.objectResults.length}
      />

      {/* Charts */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Visual Analysis</h2>
        <Charts chartData={resultsData.chartData} />
      </div>

      {/* Error Analysis */}
      {resultsData.errorAnalysis.totalErrors > 0 && (
        <div className="mb-8">
          <ErrorAnalysis 
            errorAnalysis={resultsData.errorAnalysis}
            loadSessionId={loadSessionId || ''}
          />
        </div>
      )}

      {/* Performance Metrics */}
      <div className="mb-8">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {resultsData.performance.recordsPerSecond}
              </div>
              <div className="text-sm text-gray-600">Records/Second</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {Math.round(resultsData.performance.averageTimePerObject)}ms
              </div>
              <div className="text-sm text-gray-600">Avg Time/Object</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(resultsData.performance.totalTime / 1000)}s
              </div>
              <div className="text-sm text-gray-600">Total Time</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-between items-center">
        <button onClick={() => onPrevious('execution')} className="btn-outline">
          Back to Execution
        </button>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => onPrevious('configuration')} 
            className="btn-outline"
          >
            Load More Data
          </button>
          <button 
            onClick={() => window.location.href = '/'} 
            className="btn-primary"
          >
            <Home size={16} className="mr-2" />
            Start New Session
          </button>
        </div>
      </div>
    </div>
  );
}
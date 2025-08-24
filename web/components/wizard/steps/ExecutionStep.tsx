import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { 
  PlayIcon,
  PauseIcon,
  StopIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  ChartBarIcon,
  CubeIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { WizardSession, WizardStep } from '../../../shared/types/api';
import { Socket } from 'socket.io-client';

interface ExecutionStepProps {
  session: WizardSession;
  onNext: (step: WizardStep) => void;
  onPrevious: (step: WizardStep) => void;
  socket?: Socket | null;
  updateSession?: (updates: Partial<WizardSession>) => Promise<WizardSession | null>;
}

interface ValidationStatus {
  coverage: number; // Percentage of rules that can be pre-validated
  supportedRules: number;
  totalRules: number;
  preValidationPassed: boolean;
  violationCount: number;
  warningCount: number;
  successRate?: number;
}

interface ObjectProgress {
  name: string;
  status: 'pending' | 'pre-validating' | 'generating' | 'loading' | 'completed' | 'error';
  generated: number;
  loaded: number;
  total: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  validation?: ValidationStatus;
}

interface ExecutionProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentObject?: string;
  totalObjects: number;
  completedObjects: number;
  totalRecords: number;
  generatedRecords: number;
  loadedRecords: number;
  startTime?: Date;
  estimatedEndTime?: Date;
  objectProgress: { [key: string]: ObjectProgress };
  loadSessionId?: string;
}

export default function ExecutionStep({ 
  session, 
  onNext, 
  onPrevious,
  socket,
  updateSession 
}: ExecutionStepProps) {
  const [progress, setProgress] = useState<ExecutionProgress>({
    status: 'idle',
    totalObjects: 0,
    completedObjects: 0,
    totalRecords: 0,
    generatedRecords: 0,
    loadedRecords: 0,
    objectProgress: {}
  });
  
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const executionStarted = useRef(false);

  useEffect(() => {
    // Initialize progress from session configuration
    if (session.configuration && !executionStarted.current) {
      const enabledConfigs = Object.values(session.configuration).filter(config => config.enabled);
      const totalRecords = enabledConfigs.reduce((sum, config) => sum + config.recordCount, 0);
      
      const initialObjectProgress: { [key: string]: ObjectProgress } = {};
      enabledConfigs.forEach(config => {
        initialObjectProgress[config.name] = {
          name: config.name,
          status: 'pending',
          generated: 0,
          loaded: 0,
          total: config.recordCount
        };
      });

      setProgress(prev => ({
        ...prev,
        totalObjects: enabledConfigs.length,
        totalRecords,
        objectProgress: initialObjectProgress
      }));

      // Auto-start execution when component mounts
      if (enabledConfigs.length > 0) {
        startExecution();
        executionStarted.current = true;
      }
    }
  }, [session.configuration]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    // Listen for execution progress updates
    if (socket) {
      socket.on('execution-progress', handleProgressUpdate);
      socket.on('execution-log', handleLogUpdate);
      socket.on('execution-complete', handleExecutionComplete);
      socket.on('execution-error', handleExecutionError);
      
      return () => {
        socket.off('execution-progress', handleProgressUpdate);
        socket.off('execution-log', handleLogUpdate);
        socket.off('execution-complete', handleExecutionComplete);
        socket.off('execution-error', handleExecutionError);
      };
    }
  }, [socket]);

  const handleProgressUpdate = (update: any) => {
    setProgress(prev => ({
      ...prev,
      ...update,
      // Properly merge objectProgress instead of replacing it
      objectProgress: update.objectProgress ? {
        ...prev.objectProgress,
        ...update.objectProgress
      } : prev.objectProgress,
      estimatedEndTime: update.estimatedEndTime ? new Date(update.estimatedEndTime) : undefined
    }));
  };

  const handleLogUpdate = (logEntry: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${logEntry}`]);
  };

  const handleExecutionComplete = async (results: any) => {
    setProgress(prev => ({ 
      ...prev, 
      status: 'completed',
      endTime: new Date(),
      loadSessionId: results.loadSessionId
    }));
    
    // Save loadSessionId to session for persistence across navigation
    if (updateSession && results.loadSessionId) {
      try {
        await updateSession({ loadSessionId: results.loadSessionId });
        console.log('Load session ID saved to session:', results.loadSessionId);
      } catch (error) {
        console.error('Failed to save loadSessionId to session:', error);
      }
    }
    
    toast.success('Data generation completed successfully!');
  };

  const handleExecutionError = (error: any) => {
    setProgress(prev => ({ 
      ...prev, 
      status: 'error' 
    }));
    toast.error(`Execution failed: ${error.message}`);
    handleLogUpdate(`ERROR: ${error.message}`);
  };

  const startExecution = async () => {
    try {
      setProgress(prev => ({ 
        ...prev, 
        status: 'running',
        startTime: new Date()
      }));

      handleLogUpdate('Starting data generation process...');
      handleLogUpdate(`Processing ${progress.totalObjects} objects with ${progress.totalRecords} total records`);

      // Start execution on server
      const response = await fetch(`/api/execution/start/${session.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configuration: session.configuration,
          globalSettings: session.globalSettings,
          fieldAnalysis: session.fieldAnalysis
        }),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to start execution');
      }

      handleLogUpdate('Execution started successfully');
    } catch (error) {
      console.error('Execution start error:', error);
      setProgress(prev => ({ ...prev, status: 'error' }));
      const errorMessage = error instanceof Error ? error.message : 'Failed to start execution';
      toast.error(errorMessage);
      handleLogUpdate(`ERROR: ${errorMessage}`);
    }
  };

  const pauseExecution = async () => {
    // TODO: Implement pause functionality
    setProgress(prev => ({ ...prev, status: 'paused' }));
    handleLogUpdate('Execution paused by user');
  };

  const stopExecution = async () => {
    // TODO: Implement stop functionality  
    setProgress(prev => ({ ...prev, status: 'idle' }));
    handleLogUpdate('Execution stopped by user');
  };

  const calculateOverallProgress = () => {
    if (progress.totalRecords === 0) return 0;
    return Math.round((progress.loadedRecords / progress.totalRecords) * 100);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-500 bg-gray-100';
      case 'pre-validating': return 'text-purple-500 bg-purple-100';
      case 'generating': return 'text-blue-500 bg-blue-100';
      case 'loading': return 'text-yellow-500 bg-yellow-100';
      case 'completed': return 'text-green-500 bg-green-100';
      case 'error': return 'text-red-500 bg-red-100';
      default: return 'text-gray-500 bg-gray-100';
    }
  };

  const getValidationStatusIcon = (validation?: ValidationStatus) => {
    if (!validation) return null;
    
    if (validation.preValidationPassed) {
      return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
    } else if (validation.violationCount > 0) {
      return <ExclamationCircleIcon className="h-4 w-4 text-red-500" />;
    } else {
      return <ClockIcon className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getElapsedTime = () => {
    if (!progress.startTime) return 'Not started';
    const now = progress.status === 'completed' && progress.endTime ? progress.endTime : new Date();
    const elapsed = Math.floor((now.getTime() - progress.startTime.getTime()) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}m ${seconds}s`;
  };

  // Sort objects by dependency order (same logic as server)
  const getSortedObjectProgress = () => {
    if (!session.configuration || !session.fieldAnalysis) {
      return Object.values(progress.objectProgress);
    }

    const enabledConfigs = Object.values(session.configuration).filter(config => config.enabled);
    const objectProgressList = Object.values(progress.objectProgress);
    
    // Create a mapping of object names to their progress
    const progressMap = Object.fromEntries(
      objectProgressList.map(obj => [obj.name, obj])
    );
    
    // Sort using the same dependency logic as the server
    const ordered: any[] = [];
    const remaining = [...enabledConfigs];
    const processed = new Set<string>();
    
    let maxIterations = enabledConfigs.length * 2;
    while (remaining.length > 0 && maxIterations > 0) {
      const nextBatch = [];
      
      for (let i = remaining.length - 1; i >= 0; i--) {
        const config = remaining[i];
        const analysis = session.fieldAnalysis[config.name];
        
        const dependencies = analysis?.relationships?.map((rel: any) => rel.referenceTo).flat() || [];
        const relevantDeps = dependencies.filter((dep: string) => enabledConfigs.some(c => c.name === dep));
        const canProcess = relevantDeps.every((dep: string) => processed.has(dep));
        
        if (canProcess) {
          nextBatch.push(config);
          remaining.splice(i, 1);
          processed.add(config.name);
        }
      }
      
      if (nextBatch.length === 0 && remaining.length > 0) {
        // Circular dependency - add remaining objects anyway
        nextBatch.push(...remaining);
        remaining.length = 0;
      }
      
      ordered.push(...nextBatch);
      maxIterations--;
    }
    
    // Return progress objects in dependency order
    return ordered.map(config => progressMap[config.name]).filter(Boolean);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <PlayIcon className="h-8 w-8 text-blue-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">
              Data Generation Execution
            </h1>
          </div>
          
          {/* Execution Controls */}
          <div className="flex items-center gap-2">
            {progress.status === 'idle' && (
              <button onClick={startExecution} className="btn-primary">
                <PlayIcon className="h-4 w-4 mr-2" />
                Start
              </button>
            )}
            {progress.status === 'running' && (
              <>
                <button onClick={pauseExecution} className="btn-outline">
                  <PauseIcon className="h-4 w-4 mr-2" />
                  Pause
                </button>
                <button onClick={stopExecution} className="btn-outline text-red-600">
                  <StopIcon className="h-4 w-4 mr-2" />
                  Stop
                </button>
              </>
            )}
            {progress.status === 'paused' && (
              <button onClick={startExecution} className="btn-primary">
                <PlayIcon className="h-4 w-4 mr-2" />
                Resume
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-600">
          {progress.status === 'idle' && 'Ready to start data generation process.'}
          {progress.status === 'running' && 'Generating and loading data into your Salesforce org...'}
          {progress.status === 'paused' && 'Execution paused. Click Resume to continue.'}
          {progress.status === 'completed' && 'Data generation completed successfully!'}
          {progress.status === 'error' && 'Execution encountered an error. Check logs for details.'}
        </p>
      </div>

      {/* Overall Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Overall Progress</h2>
          <span className="text-sm text-gray-600">
            {calculateOverallProgress()}% Complete
          </span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${calculateOverallProgress()}%` }}
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center">
              <CubeIcon className="h-6 w-6 text-blue-600 mr-2" />
              <div>
                <p className="text-2xl font-bold text-blue-900">
                  {progress.completedObjects}/{progress.totalObjects}
                </p>
                <p className="text-sm text-blue-600">Objects</p>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center">
              <ChartBarIcon className="h-6 w-6 text-green-600 mr-2" />
              <div>
                <p className="text-2xl font-bold text-green-900">
                  {progress.loadedRecords.toLocaleString()}
                </p>
                <p className="text-sm text-green-600">Records Loaded</p>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center">
              <ClockIcon className="h-6 w-6 text-purple-600 mr-2" />
              <div>
                <p className="text-2xl font-bold text-purple-900">
                  {getElapsedTime()}
                </p>
                <p className="text-sm text-purple-600">Elapsed Time</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className={`h-6 w-6 mr-2 flex items-center justify-center rounded-full ${
                progress.status === 'completed' ? 'bg-green-500' :
                progress.status === 'error' ? 'bg-red-500' :
                progress.status === 'running' ? 'bg-blue-500' :
                'bg-gray-500'
              }`}>
                {progress.status === 'completed' && <CheckCircleIcon className="h-4 w-4 text-white" />}
                {progress.status === 'error' && <XCircleIcon className="h-4 w-4 text-white" />}
                {progress.status === 'running' && <ArrowPathIcon className="h-4 w-4 text-white animate-spin" />}
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900 capitalize">
                  {progress.status}
                </p>
                <p className="text-sm text-amber-600">Status</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Object Progress */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Object Progress</h2>
        <div className="space-y-3">
          {getSortedObjectProgress().map((objProgress) => (
            <div key={objProgress.name} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <h3 className="font-medium text-gray-900 mr-3">{objProgress.name}</h3>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(objProgress.status)}`}>
                    {objProgress.status === 'pre-validating' ? 'validating' : objProgress.status}
                  </span>
                  {objProgress.validation && (
                    <div className="ml-2 flex items-center">
                      {getValidationStatusIcon(objProgress.validation)}
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-600">
                  {objProgress.loaded}/{objProgress.total} records
                </div>
              </div>
              
              {/* Validation Status Section */}
              {objProgress.validation && (
                <div className="mb-3 p-2 bg-gray-50 rounded-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">Validation Status</span>
                    {objProgress.validation.successRate !== undefined && (
                      <span className={`text-xs font-medium ${
                        objProgress.validation.successRate >= 95 ? 'text-green-600' :
                        objProgress.validation.successRate >= 85 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {objProgress.validation.successRate.toFixed(1)}% success rate
                      </span>
                    )}
                  </div>
                  <div className="flex items-center text-xs text-gray-600 space-x-4">
                    <span>
                      Coverage: {objProgress.validation.coverage.toFixed(1)}%
                    </span>
                    <span>
                      Rules: {objProgress.validation.supportedRules}/{objProgress.validation.totalRules}
                    </span>
                    {objProgress.validation.violationCount > 0 && (
                      <span className="text-red-600 font-medium">
                        {objProgress.validation.violationCount} issues
                      </span>
                    )}
                    {objProgress.validation.warningCount > 0 && (
                      <span className="text-yellow-600">
                        {objProgress.validation.warningCount} warnings
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    objProgress.loaded === 0 && objProgress.status === 'completed' ? 'bg-red-600' : 
                    objProgress.status === 'error' ? 'bg-red-600' :
                    objProgress.loaded < objProgress.total && objProgress.status === 'completed' ? 'bg-amber-600' :
                    objProgress.status === 'pre-validating' ? 'bg-purple-600' :
                    'bg-green-600'
                  }`}
                  style={{ width: `${objProgress.total > 0 ? Math.max(5, (objProgress.loaded / objProgress.total) * 100) : 0}%` }}
                />
              </div>
              
              {objProgress.error && (
                <div className="mt-2 text-sm text-red-600">
                  Error: {objProgress.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Execution Logs */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Execution Logs</h2>
          <label className="flex items-center text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="mr-2"
            />
            Auto-scroll
          </label>
        </div>
        
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-64 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-gray-500">Waiting for execution to start...</div>
          ) : (
            <>
              {logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button 
          onClick={() => onPrevious('preview')} 
          className="btn-outline"
          disabled={progress.status === 'running'}
        >
          Back to Preview
        </button>
        <button 
          onClick={() => onNext('results')} 
          className="btn-primary"
          disabled={progress.status !== 'completed'}
        >
          View Results
        </button>
      </div>
    </div>
  );
}
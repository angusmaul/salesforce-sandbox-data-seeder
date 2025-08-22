import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  MagnifyingGlassIcon,
  CubeIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { WizardSession, WizardStep, SalesforceObject } from '../../../shared/types/api';
import { Socket } from 'socket.io-client';

interface DiscoveryStepProps {
  session: WizardSession;
  onNext: (step: WizardStep) => void;
  onPrevious: (step: WizardStep) => void;
  socket?: Socket | null;
}

export default function DiscoveryStep({ 
  session, 
  onNext, 
  onPrevious, 
  socket 
}: DiscoveryStepProps) {
  const [discovering, setDiscovering] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [objects, setObjects] = useState<SalesforceObject[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [includeFields, setIncludeFields] = useState(false);
  
  useEffect(() => {
    // Load existing discovery results if available
    if (session.discoveredObjects) {
      setObjects(session.discoveredObjects);
      loadStats();
    }
    
    // Listen for real-time progress updates
    if (socket) {
      socket.on('progress', handleProgressUpdate);
      socket.on('step-complete', handleStepComplete);
      
      return () => {
        socket.off('progress', handleProgressUpdate);
        socket.off('step-complete', handleStepComplete);
      };
    }
  }, [socket, session.discoveredObjects]);
  
  const handleProgressUpdate = (update: any) => {
    if (update.step === 'discovery') {
      setProgress({
        current: update.data?.discovered || 0,
        total: update.data?.total || 0,
        message: update.message
      });
    }
  };
  
  const handleStepComplete = (data: any) => {
    if (data.step === 'discovery') {
      setDiscovering(false);
      loadDiscoveryResults();
      loadStats();
    }
  };
  
  const startDiscovery = async () => {
    try {
      setDiscovering(true);
      setProgress({ current: 0, total: 0, message: 'Starting discovery...' });
      
      const response = await fetch(`/api/discovery/start/${session.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          includeCustomOnly: false,
          objectFilter: null,
          includeFields: includeFields
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        toast.error(result.error || 'Failed to start discovery');
        setDiscovering(false);
      }
    } catch (error) {
      console.error('Discovery error:', error);
      toast.error('Failed to start discovery process');
      setDiscovering(false);
    }
  };
  
  const loadDiscoveryResults = async () => {
    try {
      const response = await fetch(`/api/discovery/results/${session.id}`);
      const result = await response.json();
      
      if (result.success) {
        setObjects(result.data);
      }
    } catch (error) {
      console.error('Failed to load discovery results:', error);
    }
  };
  
  const loadStats = async () => {
    try {
      const response = await fetch(`/api/discovery/stats/${session.id}`);
      const result = await response.json();
      
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Failed to load discovery stats:', error);
    }
  };
  
  const hasDiscoveredObjects = objects.length > 0;
  
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <MagnifyingGlassIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">
            Schema Discovery
          </h1>
        </div>
        <p className="text-gray-600">
          Discover your Salesforce objects and their basic metadata. 
          Field analysis will be performed later on your selected objects for optimal efficiency.
        </p>
      </div>
      
      {/* Discovery Status */}
      {discovering && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center mb-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
            <h3 className="font-medium text-blue-800">Discovery in Progress</h3>
          </div>
          
          <p className="text-blue-700 mb-3">{progress.message}</p>
          
          {progress.total > 0 && (
            <div>
              <div className="flex justify-between text-sm text-blue-600 mb-1">
                <span>Progress</span>
                <span>{progress.current} of {progress.total}</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Discovery Results */}
      {hasDiscoveredObjects && (
        <div className="space-y-6">
          {/* Discovery Actions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">Discovery Complete</h3>
                <p className="text-sm text-gray-600">Found {objects.length} creatable objects in your org</p>
              </div>
              <button
                onClick={() => {
                  setObjects([]);
                  setStats(null);
                  // Clear discovery from session
                  fetch(`/api/sessions/${session.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ discoveredObjects: null })
                  });
                }}
                className="btn-outline text-sm"
              >
                Restart Discovery
              </button>
            </div>
          </div>
          
          {/* Summary Stats */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <CubeIcon className="h-6 w-6 text-blue-600 mr-2" />
                  <div>
                    <p className="text-2xl font-bold text-blue-900">{stats.totalObjects}</p>
                    <p className="text-sm text-blue-600">Total Objects</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <ChartBarIcon className="h-6 w-6 text-green-600 mr-2" />
                  <div>
                    <p className="text-2xl font-bold text-green-900">{stats.creatableObjects}</p>
                    <p className="text-sm text-green-600">Creatable Objects</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <CubeIcon className="h-6 w-6 text-purple-600 mr-2" />
                  <div>
                    <p className="text-2xl font-bold text-purple-900">{stats.customObjects}</p>
                    <p className="text-sm text-purple-600">Custom Objects</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Next Steps */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-100">
                  <span className="text-green-600 font-semibold">✓</span>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Object Discovery Complete</h3>
                <p className="mt-2 text-sm text-green-700">
                  Ready to proceed to object selection. Field analysis will be performed 
                  on your selected objects for optimal efficiency.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* No Discovery Results */}
      {!discovering && !hasDiscoveredObjects && (
        <div className="text-center py-12">
          <MagnifyingGlassIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Ready to Discover Your Schema
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Start with a fast object scan to discover your Salesforce schema. 
            This typically takes 30-60 seconds and finds all creatable objects.
          </p>
          
          {/* Discovery Strategy Info */}
          <div className="mb-6 max-w-lg mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Smart Discovery Process</h4>
              <div className="text-sm text-blue-700 space-y-1">
                <div>1. <strong>Object Scan</strong> - Fast discovery of all objects</div>
                <div>2. <strong>Object Selection</strong> - Choose which objects to populate</div>
                <div>3. <strong>Field Analysis</strong> - Deep analysis only on selected objects</div>
                <div>4. <strong>Dependency Resolution</strong> - Auto-add required related objects</div>
              </div>
            </div>
          </div>
          
          {/* Advanced Options */}
          <div className="mb-6 max-w-md mx-auto">
            <details className="cursor-pointer">
              <summary className="text-sm text-gray-600 hover:text-gray-800">Advanced Options</summary>
              <div className="mt-3 p-3 bg-gray-50 rounded border">
                <label className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    checked={includeFields}
                    onChange={(e) => setIncludeFields(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded mt-0.5"
                  />
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Include Field Analysis Now</div>
                    <div className="text-xs text-gray-600">
                      Analyze all object fields immediately (slower, but comprehensive)
                    </div>
                  </div>
                </label>
              </div>
            </details>
          </div>
          
          <button
            onClick={startDiscovery}
            className="btn-primary"
          >
            Start Discovery
          </button>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={() => onPrevious('authentication')}
          className="btn-outline"
        >
          Back to Authentication
        </button>
        
        <button
          onClick={() => onNext('selection')}
          disabled={!hasDiscoveredObjects}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Selection
        </button>
      </div>
    </div>
  );
}
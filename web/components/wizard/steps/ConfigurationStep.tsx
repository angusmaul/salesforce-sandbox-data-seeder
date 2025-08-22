import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  CogIcon,
  DocumentTextIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { WizardSession, WizardStep, DataGenerationPreferences as PrefsType } from '../../../shared/types/api';
import { Socket } from 'socket.io-client';
import DataGenerationPreferences from '../../preferences/DataGenerationPreferences';

interface ConfigurationStepProps {
  session: WizardSession;
  onNext: (step: WizardStep) => void;
  onPrevious: (step: WizardStep) => void;
  updateSession?: (updates: Partial<WizardSession>) => Promise<void>;
  socket?: Socket | null;
}

interface ObjectConfiguration {
  name: string;
  recordCount: number;
  enabled: boolean;
  priority: number; // For load order
}

export default function ConfigurationStep({ 
  session, 
  onNext, 
  onPrevious,
  updateSession
}: ConfigurationStepProps) {
  const [configurations, setConfigurations] = useState<{[key: string]: ObjectConfiguration}>({});
  const [globalSettings, setGlobalSettings] = useState({
    batchSize: 200,
    respectRequiredFields: true,
    skipValidationRules: false,
    createTestData: true
  });
  const [storageInfo, setStorageInfo] = useState<{
    totalStorage: number;
    usedStorage: number;
    availableStorage: number;
    estimatedUsage: number;
    loading: boolean;
    error?: string;
  }>({
    totalStorage: 0,
    usedStorage: 0,
    availableStorage: 0,
    estimatedUsage: 0,
    loading: true
  });
  const [dataGenerationPreferences, setDataGenerationPreferences] = useState<PrefsType | null>(null);

  useEffect(() => {
    // Initialize configurations with smart defaults
    if (session.selectedObjects && session.fieldAnalysis) {
      const initialConfigs: {[key: string]: ObjectConfiguration} = {};
      
      session.selectedObjects.forEach((objName, index) => {
        const fieldAnalysis = session.fieldAnalysis?.[objName];
        
        // Smart defaults based on object type and relationships
        let defaultCount = 50; // Default
        
        // Core objects get more records
        if (['Account', 'Contact'].includes(objName)) {
          defaultCount = 100;
        }
        // Transaction objects get fewer records  
        else if (['Opportunity', 'Case', 'Campaign'].includes(objName)) {
          defaultCount = 25;
        }
        // Junction/line item objects get more
        else if (objName.includes('Line') || fieldAnalysis?.relationships?.length > 2) {
          defaultCount = 75;
        }
        
        initialConfigs[objName] = {
          name: objName,
          recordCount: session.configuration?.[objName]?.recordCount || defaultCount,
          enabled: true,
          priority: session.configuration?.[objName]?.priority || index + 1
        };
      });
      
      setConfigurations(initialConfigs);
    }
  }, [session.selectedObjects, session.fieldAnalysis, session.configuration]);

  useEffect(() => {
    // Fetch storage information when component mounts
    fetchStorageInfo();
  }, [session.id]);

  useEffect(() => {
    // Recalculate estimated usage when configurations change
    calculateEstimatedStorage();
  }, [configurations, session.fieldAnalysis]);

  // Remove redundant preference loading - let the child component handle it
  // and just use the callback to update parent state when needed

  const fetchStorageInfo = async () => {
    try {
      setStorageInfo(prev => ({ ...prev, loading: true, error: undefined }));
      
      const response = await fetch(`/api/storage/info/${session.id}`);
      const result = await response.json();
      
      if (result.success) {
        setStorageInfo(prev => ({
          ...prev,
          totalStorage: result.data.totalStorage,
          usedStorage: result.data.usedStorage,
          availableStorage: result.data.availableStorage,
          loading: false
        }));
      } else {
        throw new Error(result.error || 'Failed to fetch storage information');
      }
    } catch (error) {
      console.error('Storage info error:', error);
      setStorageInfo(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch storage information'
      }));
    }
  };

  const calculateEstimatedStorage = () => {
    if (!session.fieldAnalysis) return;

    let totalEstimatedBytes = 0;
    
    Object.entries(configurations).forEach(([objectName, config]) => {
      if (!config.enabled) return;
      
      const fieldAnalysis = session.fieldAnalysis[objectName];
      if (!fieldAnalysis?.fields) return;

      // Calculate average record size based on field types and lengths
      let avgRecordSize = 0;
      
      fieldAnalysis.fields.forEach((field: any) => {
        switch (field.type?.toLowerCase()) {
          case 'string':
          case 'textarea':
            avgRecordSize += field.length ? Math.min(field.length * 0.7, 255) : 50;
            break;
          case 'email':
            avgRecordSize += 30;
            break;
          case 'phone':
            avgRecordSize += 15;
            break;
          case 'url':
            avgRecordSize += 100;
            break;
          case 'boolean':
            avgRecordSize += 1;
            break;
          case 'date':
            avgRecordSize += 10;
            break;
          case 'datetime':
            avgRecordSize += 19;
            break;
          case 'currency':
          case 'double':
          case 'percent':
            avgRecordSize += 8;
            break;
          case 'int':
            avgRecordSize += 4;
            break;
          case 'picklist':
            avgRecordSize += 20;
            break;
          case 'multipicklist':
            avgRecordSize += 50;
            break;
          case 'reference':
            avgRecordSize += 18; // Salesforce ID size
            break;
          case 'id':
            avgRecordSize += 18;
            break;
          default:
            avgRecordSize += 25; // Conservative default
        }
      });

      // Add metadata overhead (indexes, system fields, etc.)
      avgRecordSize += 100;
      
      // Calculate total for this object
      const objectTotalBytes = avgRecordSize * config.recordCount;
      totalEstimatedBytes += objectTotalBytes;
    });

    // Convert to MB and add 20% buffer for indexes and metadata
    const estimatedMB = Math.ceil((totalEstimatedBytes * 1.2) / (1024 * 1024));
    
    setStorageInfo(prev => ({
      ...prev,
      estimatedUsage: estimatedMB
    }));
  };

  const formatStorageSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
  };

  const getStorageWarningLevel = () => {
    if (storageInfo.estimatedUsage > storageInfo.availableStorage) {
      return 'error'; // Not enough space
    } else if (storageInfo.estimatedUsage > storageInfo.availableStorage * 0.8) {
      return 'warning'; // Using >80% of available space
    }
    return 'ok';
  };

  const updateConfiguration = (objectName: string, updates: Partial<ObjectConfiguration>) => {
    setConfigurations(prev => ({
      ...prev,
      [objectName]: { ...prev[objectName], ...updates }
    }));
  };

  const handlePreferencesChange = async (preferences: PrefsType) => {
    // Avoid unnecessary updates by comparing with current state
    const currentPrefs = dataGenerationPreferences;
    const hasChanged = !currentPrefs || 
      JSON.stringify(currentPrefs.selectedCountries?.sort()) !== JSON.stringify(preferences.selectedCountries?.sort()) ||
      currentPrefs.useOrgPicklists !== preferences.useOrgPicklists;
    
    setDataGenerationPreferences(preferences);
    
    // Only update session if preferences actually changed
    if (updateSession && hasChanged) {
      await updateSession({ dataGenerationPreferences: preferences });
    }
  };

  const handleContinue = async () => {
    try {
      // Validate configurations
      const enabledObjects = Object.values(configurations).filter(config => config.enabled);
      if (enabledObjects.length === 0) {
        toast.error('Please enable at least one object for data generation');
        return;
      }

      // Check storage availability
      const storageWarning = getStorageWarningLevel();
      if (storageWarning === 'error') {
        toast.error(`Insufficient storage space! Estimated usage: ${formatStorageSize(storageInfo.estimatedUsage * 1024 * 1024)}, Available: ${formatStorageSize(storageInfo.availableStorage * 1024 * 1024)}`);
        return;
      } else if (storageWarning === 'warning') {
        const proceed = window.confirm(
          `This will use ${formatStorageSize(storageInfo.estimatedUsage * 1024 * 1024)} of your ${formatStorageSize(storageInfo.availableStorage * 1024 * 1024)} available storage (${Math.round((storageInfo.estimatedUsage / storageInfo.availableStorage) * 100)}%). Continue?`
        );
        if (!proceed) return;
      }

      // Check for reasonable record counts
      const totalRecords = enabledObjects.reduce((sum, config) => sum + config.recordCount, 0);
      if (totalRecords > 5000) {
        const proceed = window.confirm(
          `You're about to generate ${totalRecords} total records. This may take a while. Continue?`
        );
        if (!proceed) return;
      }

      // Save configuration to session
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configuration: configurations,
          globalSettings
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Configuration saved successfully!');
        onNext('preview');
      } else {
        toast.error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Configuration save error:', error);
      toast.error('Failed to save configuration');
    }
  };

  const totalRecords = Object.values(configurations)
    .filter(config => config.enabled)
    .reduce((sum, config) => sum + config.recordCount, 0);

  const estimatedTime = Math.ceil(totalRecords / 100); // Rough estimate: 100 records per minute

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <CogIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">
            Configure Data Generation
          </h1>
        </div>
        <p className="text-gray-600">
          Configure record counts and settings for each selected object. Objects will be loaded in dependency order.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center">
            <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-blue-900">{Object.keys(configurations).length}</p>
              <p className="text-sm text-blue-600">Selected Objects</p>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center">
            <ChartBarIcon className="h-6 w-6 text-green-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-green-900">{totalRecords.toLocaleString()}</p>
              <p className="text-sm text-green-600">Total Records</p>
            </div>
          </div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="flex items-center">
            <InformationCircleIcon className="h-6 w-6 text-purple-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-purple-900">~{estimatedTime}min</p>
              <p className="text-sm text-purple-600">Estimated Time</p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-lg ${
          storageInfo.loading ? 'bg-gray-50' :
          getStorageWarningLevel() === 'error' ? 'bg-red-50' :
          getStorageWarningLevel() === 'warning' ? 'bg-amber-50' :
          'bg-emerald-50'
        }`}>
          <div className="flex items-center">
            <div className={`h-6 w-6 mr-2 ${
              storageInfo.loading ? 'text-gray-600' :
              getStorageWarningLevel() === 'error' ? 'text-red-600' :
              getStorageWarningLevel() === 'warning' ? 'text-amber-600' :
              'text-emerald-600'
            }`}>
              {storageInfo.loading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
              ) : (
                <InformationCircleIcon className="h-6 w-6" />
              )}
            </div>
            <div>
              <p className={`text-2xl font-bold ${
                storageInfo.loading ? 'text-gray-900' :
                getStorageWarningLevel() === 'error' ? 'text-red-900' :
                getStorageWarningLevel() === 'warning' ? 'text-amber-900' :
                'text-emerald-900'
              }`}>
                {storageInfo.loading ? '...' : `${formatStorageSize(storageInfo.estimatedUsage * 1024 * 1024)}`}
              </p>
              <p className={`text-sm ${
                storageInfo.loading ? 'text-gray-600' :
                getStorageWarningLevel() === 'error' ? 'text-red-600' :
                getStorageWarningLevel() === 'warning' ? 'text-amber-600' :
                'text-emerald-600'
              }`}>
                Estimated Storage
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Details */}
      {!storageInfo.loading && !storageInfo.error && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Storage Information</h2>
          <div className={`border rounded-lg p-4 ${
            getStorageWarningLevel() === 'error' ? 'border-red-200 bg-red-50' :
            getStorageWarningLevel() === 'warning' ? 'border-amber-200 bg-amber-50' :
            'border-green-200 bg-green-50'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Organization Storage</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total:</span>
                    <span className="font-medium">{formatStorageSize(storageInfo.totalStorage * 1024 * 1024)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Used:</span>
                    <span className="font-medium">{formatStorageSize(storageInfo.usedStorage * 1024 * 1024)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Available:</span>
                    <span className="font-medium">{formatStorageSize(storageInfo.availableStorage * 1024 * 1024)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Data Load Impact</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Estimated Usage:</span>
                    <span className="font-medium">{formatStorageSize(storageInfo.estimatedUsage * 1024 * 1024)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">% of Available:</span>
                    <span className={`font-medium ${
                      getStorageWarningLevel() === 'error' ? 'text-red-600' :
                      getStorageWarningLevel() === 'warning' ? 'text-amber-600' :
                      'text-green-600'
                    }`}>
                      {Math.round((storageInfo.estimatedUsage / storageInfo.availableStorage) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">After Load:</span>
                    <span className="font-medium">
                      {formatStorageSize((storageInfo.availableStorage - storageInfo.estimatedUsage) * 1024 * 1024)} remaining
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Storage Usage</h3>
                <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                  <div 
                    className="bg-gray-400 h-4 rounded-full"
                    style={{ width: `${(storageInfo.usedStorage / storageInfo.totalStorage) * 100}%` }}
                  />
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div 
                    className={`h-4 rounded-full ${
                      getStorageWarningLevel() === 'error' ? 'bg-red-500' :
                      getStorageWarningLevel() === 'warning' ? 'bg-amber-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min((storageInfo.estimatedUsage / storageInfo.availableStorage) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>Current Usage</span>
                  <span>Estimated Load</span>
                </div>
              </div>
            </div>

            {getStorageWarningLevel() === 'error' && (
              <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-red-800 font-medium">Insufficient Storage Space</p>
                    <p className="text-red-700 mt-1">
                      The estimated data load ({formatStorageSize(storageInfo.estimatedUsage * 1024 * 1024)}) exceeds your available storage space ({formatStorageSize(storageInfo.availableStorage * 1024 * 1024)}). 
                      Please reduce the number of records or contact your administrator to increase storage capacity.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {getStorageWarningLevel() === 'warning' && (
              <div className="mt-4 p-3 bg-amber-100 border border-amber-200 rounded-lg">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-800 font-medium">High Storage Usage Warning</p>
                    <p className="text-amber-700 mt-1">
                      This data load will use {Math.round((storageInfo.estimatedUsage / storageInfo.availableStorage) * 100)}% of your available storage space. 
                      Consider reducing record counts if you plan to load additional data later.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {storageInfo.error && (
        <div className="mb-8">
          <div className="border border-red-200 bg-red-50 rounded-lg p-4">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-red-800 font-medium">Storage Information Unavailable</p>
                <p className="text-red-700 mt-1">
                  Unable to fetch storage information: {storageInfo.error}
                </p>
                <button
                  onClick={fetchStorageInfo}
                  className="text-red-600 underline hover:text-red-800 mt-2"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Object Configurations */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Record Counts by Object</h2>
        <div className="space-y-4">
          {Object.entries(configurations).map(([objectName, config]) => {
            const fieldAnalysis = session.fieldAnalysis?.[objectName];
            const relationshipCount = fieldAnalysis?.relationships?.length || 0;
            
            return (
              <div key={objectName} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => updateConfiguration(objectName, { enabled: e.target.checked })}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded mr-3"
                    />
                    <div>
                      <h3 className="font-medium text-gray-900">{objectName}</h3>
                      <p className="text-sm text-gray-600">
                        {fieldAnalysis?.label} • {fieldAnalysis?.fieldCount} fields
                        {relationshipCount > 0 && ` • ${relationshipCount} relationships`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">Records:</label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={config.recordCount}
                        onChange={(e) => updateConfiguration(objectName, { 
                          recordCount: parseInt(e.target.value) || 1 
                        })}
                        disabled={!config.enabled}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    
                    {relationshipCount > 0 && (
                      <div className="flex items-center text-amber-600">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                        <span className="text-xs">Has dependencies</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {relationshipCount > 0 && (
                  <div className="ml-7 text-sm text-gray-600">
                    <strong>Dependencies:</strong> {(fieldAnalysis.relationships || []).slice(0, 3).map((rel: any) => rel.referenceTo[0]).join(', ')}
                    {relationshipCount > 3 && ` +${relationshipCount - 3} more`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Settings */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Global Settings</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={globalSettings.respectRequiredFields}
                  onChange={(e) => setGlobalSettings(prev => ({ 
                    ...prev, 
                    respectRequiredFields: e.target.checked 
                  }))}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded mr-2"
                />
                <span className="text-sm text-gray-700">Populate required fields</span>
              </label>
            </div>
            
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={globalSettings.createTestData}
                  onChange={(e) => setGlobalSettings(prev => ({ 
                    ...prev, 
                    createTestData: e.target.checked 
                  }))}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded mr-2"
                />
                <span className="text-sm text-gray-700">Generate realistic test data</span>
              </label>
            </div>
            
            <div className="md:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={globalSettings.skipValidationRules}
                  onChange={(e) => setGlobalSettings(prev => ({ 
                    ...prev, 
                    skipValidationRules: e.target.checked 
                  }))}
                  className="h-4 w-4 text-yellow-600 border-gray-300 rounded mr-2"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">Temporarily disable validation rules during load</span>
                  <span className="block text-xs text-gray-500 mt-1">
                    Recommended for new orgs. Bypasses custom validation rules that might prevent data load.
                    Rules are automatically restored after the load completes.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Data Generation Preferences */}
      <div className="mb-8">
        <DataGenerationPreferences
          sessionId={session.id}
          preferences={dataGenerationPreferences}
          onPreferencesChange={handlePreferencesChange}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button onClick={() => onPrevious('selection')} className="btn-outline">
          Back to Selection
        </button>
        <button 
          onClick={handleContinue}
          className="btn-primary"
          disabled={totalRecords === 0}
        >
          Continue to Preview ({totalRecords.toLocaleString()} records)
        </button>
      </div>
    </div>
  );
}
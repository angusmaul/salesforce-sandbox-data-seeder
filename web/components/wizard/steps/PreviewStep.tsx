import React, { useState, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { 
  EyeIcon,
  PlayIcon,
  ClockIcon,
  CubeIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
  DocumentTextIcon,
  LinkIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';
import { WizardSession, WizardStep } from '../../../shared/types/api';
import { Socket } from 'socket.io-client';

interface PreviewStepProps {
  session: WizardSession;
  onNext: (step: WizardStep) => void;
  onPrevious: (step: WizardStep) => void;
  socket?: Socket | null;
}

export default function PreviewStep({ 
  session, 
  onNext, 
  onPrevious 
}: PreviewStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedObjectForPreview, setSelectedObjectForPreview] = useState<string | null>(null);
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());

  // Calculate generation summary
  const generationSummary = useMemo(() => {
    if (!session.configuration) return null;

    const enabledConfigs = Object.values(session.configuration).filter(config => config.enabled);
    const totalRecords = enabledConfigs.reduce((sum, config) => sum + config.recordCount, 0);
    const estimatedTime = Math.ceil(totalRecords / 100); // ~100 records per minute
    
    return {
      objectCount: enabledConfigs.length,
      totalRecords,
      estimatedTime,
      enabledConfigs
    };
  }, [session.configuration]);

  // Calculate dependency order (iterative topological sort to avoid circular reference issues)
  const dependencyOrder = useMemo(() => {
    if (!session.configuration || !session.fieldAnalysis) return [];

    const enabledConfigs = Object.values(session.configuration).filter(config => config.enabled);
    
    // Create a safe ordering that handles circular dependencies
    const ordered: any[] = [];
    const remaining = [...enabledConfigs];
    const processed = new Set<string>();
    
    // First, add objects with no dependencies or dependencies outside our selected set
    const addNextBatch = () => {
      const nextBatch: any[] = [];
      
      for (let i = remaining.length - 1; i >= 0; i--) {
        const config = remaining[i];
        const fieldAnalysis = session.fieldAnalysis[config.name];
        
        // Get dependencies that are in our selected objects
        const relevantDeps = fieldAnalysis?.relationships?.map((rel: any) => rel.referenceTo).flat()
          .filter((dep: string) => enabledConfigs.some(c => c.name === dep)) || [];
        
        // If all relevant dependencies are already processed, this object can be added
        const canAdd = relevantDeps.every((dep: string) => processed.has(dep));
        
        if (canAdd) {
          nextBatch.push({
            ...config,
            fieldAnalysis,
            dependencies: relevantDeps
          });
          remaining.splice(i, 1);
          processed.add(config.name);
        }
      }
      
      return nextBatch;
    };
    
    // Process in batches until all objects are ordered
    let maxIterations = enabledConfigs.length + 5; // Safety limit
    while (remaining.length > 0 && maxIterations > 0) {
      const batch = addNextBatch();
      
      if (batch.length === 0) {
        // Circular dependency detected - add remaining objects anyway
        const remaining_copy = [...remaining];
        remaining_copy.forEach(config => {
          const fieldAnalysis = session.fieldAnalysis[config.name];
          const relevantDeps = fieldAnalysis?.relationships?.map((rel: any) => rel.referenceTo).flat()
            .filter((dep: string) => enabledConfigs.some(c => c.name === dep)) || [];
          
          batch.push({
            ...config,
            fieldAnalysis,
            dependencies: relevantDeps
          });
          processed.add(config.name);
        });
        remaining.length = 0; // Clear remaining
      }
      
      ordered.push(...batch);
      maxIterations--;
    }
    
    return ordered;
  }, [session.configuration, session.fieldAnalysis]);

  const handleStartGeneration = async () => {
    if (!generationSummary || generationSummary.totalRecords === 0) {
      toast.error('No records configured for generation');
      return;
    }

    // Confirm large datasets
    if (generationSummary.totalRecords > 1000) {
      const proceed = window.confirm(
        `You're about to generate ${generationSummary.totalRecords.toLocaleString()} records across ${generationSummary.objectCount} objects. This will take approximately ${generationSummary.estimatedTime} minutes. Continue?`
      );
      if (!proceed) return;
    }

    try {
      setIsGenerating(true);
      toast.success('Starting data generation...');
      onNext('execution');
    } catch (error) {
      console.error('Generation start error:', error);
      toast.error('Failed to start data generation');
      setIsGenerating(false);
    }
  };

  const toggleObjectExpansion = (objectName: string) => {
    setExpandedObjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(objectName)) {
        newSet.delete(objectName);
      } else {
        newSet.add(objectName);
      }
      return newSet;
    });
  };

  // System fields that cannot be written to
  const systemFields = new Set([
    'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById', 
    'SystemModstamp', 'LastActivityDate', 'LastViewedDate', 'LastReferencedDate',
    'IsDeleted', 'MasterRecordId', 'RecordTypeId', 'OwnerId'
  ]);

  // Generate sample field data preview with variation
  const generateSampleFieldData = (field: any, recordIndex: number) => {
    const baseValue = (() => {
      switch (field.type.toLowerCase()) {
        case 'string':
        case 'textarea':
          if (field.name.toLowerCase().includes('name')) {
            return [`Sample Company ${recordIndex + 1}`, `Test Account ${recordIndex + 1}`, `Demo Business ${recordIndex + 1}`][recordIndex % 3];
          }
          if (field.name.toLowerCase().includes('email')) {
            return [`user${recordIndex + 1}@example.com`, `test${recordIndex + 1}@demo.com`, `sample${recordIndex + 1}@test.org`][recordIndex % 3];
          }
          if (field.name.toLowerCase().includes('phone')) {
            return [`+1 (555) ${String(123 + recordIndex).padStart(3, '0')}-${String(4567 + recordIndex).padStart(4, '0')}`, 
                    `+1 (444) ${String(987 + recordIndex).padStart(3, '0')}-${String(6543 + recordIndex).padStart(4, '0')}`, 
                    `+1 (333) ${String(456 + recordIndex).padStart(3, '0')}-${String(7890 + recordIndex).padStart(4, '0')}`][recordIndex % 3];
          }
          return `Sample text data ${recordIndex + 1}`;
        case 'email':
          return [`user${recordIndex + 1}@example.com`, `test${recordIndex + 1}@demo.com`, `sample${recordIndex + 1}@test.org`][recordIndex % 3];
        case 'phone':
          return `+1 (555) ${String(123 + recordIndex).padStart(3, '0')}-${String(4567 + recordIndex).padStart(4, '0')}`;
        case 'url':
          return [`https://example${recordIndex + 1}.com`, `https://demo${recordIndex + 1}.org`, `https://test${recordIndex + 1}.net`][recordIndex % 3];
        case 'boolean':
          return [true, false, true][recordIndex % 3].toString();
        case 'date':
          const date = new Date(2024, 11, 1 + recordIndex);
          return date.toISOString().split('T')[0];
        case 'datetime':
          const datetime = new Date(2024, 11, 1 + recordIndex, 10 + recordIndex % 12, 30);
          return datetime.toISOString().replace('T', ' ').slice(0, 19);
        case 'currency':
        case 'double':
          return (1000 + recordIndex * 250).toString();
        case 'int':
          return (100 + recordIndex * 25).toString();
        case 'percent':
          return `${75 + recordIndex * 5}%`;
        case 'picklist':
          return [`Option A`, `Option B`, `Option C`][recordIndex % 3];
        case 'multipicklist':
          return [`Option A`, `Option B; Option C`, `Option A; Option C`][recordIndex % 3];
        case 'reference':
          return field.referenceTo?.[0] ? `REF${String(1001 + recordIndex).padStart(4, '0')}` : `REF${String(1001 + recordIndex).padStart(4, '0')}`;
        default:
          return `Value ${recordIndex + 1}`;
      }
    })();
    
    return baseValue;
  };

  // Filter writable fields
  const getWritableFields = (fieldAnalysis: any) => {
    return fieldAnalysis?.fields?.filter((field: any) => 
      !systemFields.has(field.name) && 
      !field.name.endsWith('__pc') && // Person Contact fields
      !field.name.startsWith('Formula') &&
      field.type !== 'calculated' &&
      field.type !== 'summary'
    ) || [];
  };

  if (!generationSummary) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <ExclamationTriangleIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Configuration Found
          </h3>
          <p className="text-gray-600 mb-6">
            Please go back and configure your data generation settings.
          </p>
          <button onClick={() => onPrevious('configuration')} className="btn-primary">
            Back to Configuration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <EyeIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">
            Review Generation Plan
          </h1>
        </div>
        <p className="text-gray-600">
          Review your data generation configuration before starting. Objects will be processed in dependency order.
        </p>
      </div>

      {/* Generation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center">
            <CubeIcon className="h-6 w-6 text-blue-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-blue-900">{generationSummary.objectCount}</p>
              <p className="text-sm text-blue-600">Objects</p>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center">
            <ChartBarIcon className="h-6 w-6 text-green-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-green-900">{generationSummary.totalRecords.toLocaleString()}</p>
              <p className="text-sm text-green-600">Total Records</p>
            </div>
          </div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="flex items-center">
            <ClockIcon className="h-6 w-6 text-purple-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-purple-900">~{generationSummary.estimatedTime}min</p>
              <p className="text-sm text-purple-600">Estimated Time</p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 p-4 rounded-lg">
          <div className="flex items-center">
            <InformationCircleIcon className="h-6 w-6 text-amber-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-amber-900">{session.connectionInfo?.instanceUrl?.includes('--') ? 'Sandbox' : 'Production'}</p>
              <p className="text-sm text-amber-600">Target Org</p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-lg ${session.aiSettings?.suggestionsEnabled ? 'bg-indigo-50' : 'bg-gray-50'}`}>
          <div className="flex items-center">
            <LightBulbIcon className={`h-6 w-6 mr-2 ${session.aiSettings?.suggestionsEnabled ? 'text-indigo-600' : 'text-gray-400'}`} />
            <div>
              <p className={`text-2xl font-bold ${session.aiSettings?.suggestionsEnabled ? 'text-indigo-900' : 'text-gray-500'}`}>
                {session.aiSettings?.suggestionsEnabled ? 'ON' : 'OFF'}
              </p>
              <p className={`text-sm ${session.aiSettings?.suggestionsEnabled ? 'text-indigo-600' : 'text-gray-500'}`}>
                AI Suggestions
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Configuration Details */}
      {session.aiSettings?.suggestionsEnabled && (
        <div className="mb-8">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <LightBulbIcon className="h-6 w-6 text-indigo-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">AI-Powered Data Generation</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Configuration:</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center">
                    <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                    <span>Claude AI suggestions enabled</span>
                  </li>
                  {session.aiSettings.businessScenario && (
                    <li className="flex items-center">
                      <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                      <span>Business scenario: <strong>{session.aiSettings.businessScenario}</strong></span>
                    </li>
                  )}
                  <li className="flex items-center">
                    <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                    <span>Context-aware field generation</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                    <span>Relationship-based data coherence</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-3">Benefits:</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    <span>Industry-specific data patterns</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    <span>Realistic business relationships</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    <span>Validation-compliant values</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    <span>Higher data quality and usability</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-4 p-3 bg-white border border-indigo-200 rounded-lg">
              <div className="flex items-start">
                <InformationCircleIcon className="h-5 w-5 text-indigo-500 mr-2 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-indigo-800 font-medium">Enhanced Data Generation</p>
                  <p className="text-indigo-700 mt-1">
                    AI suggestions will be used during data generation to create more realistic, context-aware field values. 
                    This may slightly increase generation time but significantly improves data quality and business relevance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Order */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Processing Order</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center mb-4">
            <InformationCircleIcon className="h-5 w-5 text-blue-600 mr-2" />
            <p className="text-sm text-gray-600">
              Objects will be processed in this order to respect data dependencies:
            </p>
          </div>
          
          <div className="space-y-3">
            {dependencyOrder.map((item, index) => {
              const isExpanded = expandedObjects.has(item.name);
              const fieldAnalysis = item.fieldAnalysis;
              const requiredFields = fieldAnalysis?.fields?.filter((f: any) => f.required) || [];
              const totalFields = fieldAnalysis?.fields?.length || 0;
              
              return (
                <div key={item.name} className="border border-gray-200 rounded-lg">
                  <div 
                    className="flex items-center p-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleObjectExpansion(item.name)}
                  >
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mr-4">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center">
                        <h3 className="font-medium text-gray-900 mr-4">{item.name}</h3>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                          {item.recordCount.toLocaleString()} records
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                          {totalFields} fields
                        </span>
                        {item.dependencies.length > 0 && (
                          <span className="text-xs text-gray-500">
                            Depends on: {item.dependencies.slice(0, 2).join(', ')}
                            {item.dependencies.length > 2 && ` +${item.dependencies.length - 2} more`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{item.fieldAnalysis?.label}</p>
                    </div>
                    <div className="flex items-center ml-4">
                      {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                  
                  {/* Expandable Field Details */}
                  {isExpanded && fieldAnalysis && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50">
                      <div className="space-y-6">
                        {/* Field Summary */}
                        <div>
                          <div className="flex items-center mb-3">
                            <InformationCircleIcon className="h-4 w-4 text-green-600 mr-2" />
                            <h4 className="font-medium text-gray-900">Field Summary</h4>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Writable Fields:</div>
                              <div className="font-bold text-blue-600">{getWritableFields(fieldAnalysis).length}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Required Fields:</div>
                              <div className="font-bold text-red-600">{requiredFields.filter(f => !systemFields.has(f.name)).length}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Custom Fields:</div>
                              <div className="font-bold text-purple-600">{getWritableFields(fieldAnalysis).filter((f: any) => f.custom).length}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Relationships:</div>
                              <div className="font-bold text-green-600">{item.dependencies.length}</div>
                            </div>
                          </div>
                        </div>

                        {/* Sample Data Table */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center">
                              <DocumentTextIcon className="h-4 w-4 text-blue-600 mr-2" />
                              <h4 className="font-medium text-gray-900">Sample Data Preview</h4>
                            </div>
                            <span className="text-sm text-gray-600">Showing 5 sample records</span>
                          </div>
                          
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                                      #
                                    </th>
                                    {getWritableFields(fieldAnalysis).slice(0, 8).map((field: any) => (
                                      <th key={field.name} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-0">
                                        <div className="flex items-center gap-1">
                                          <span className="truncate">{field.name}</span>
                                          {field.required && <span className="text-red-500">*</span>}
                                          {field.custom && <span className="text-purple-500">⚙</span>}
                                        </div>
                                        <div className="text-xs normal-case text-gray-400 font-normal">
                                          {field.type}
                                        </div>
                                      </th>
                                    ))}
                                    {getWritableFields(fieldAnalysis).length > 8 && (
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        +{getWritableFields(fieldAnalysis).length - 8} more
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {[0, 1, 2, 3, 4].map((recordIndex) => (
                                    <tr key={recordIndex} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 text-sm text-gray-900 font-medium">
                                        {recordIndex + 1}
                                      </td>
                                      {getWritableFields(fieldAnalysis).slice(0, 8).map((field: any) => (
                                        <td key={field.name} className="px-3 py-2 text-sm text-gray-900 max-w-0">
                                          <div className="truncate" title={generateSampleFieldData(field, recordIndex)}>
                                            {generateSampleFieldData(field, recordIndex)}
                                          </div>
                                        </td>
                                      ))}
                                      {getWritableFields(fieldAnalysis).length > 8 && (
                                        <td className="px-3 py-2 text-sm text-gray-400">
                                          ...
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                        
                        {/* Required Fields List */}
                        {requiredFields.filter(f => !systemFields.has(f.name)).length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">Required Fields (will be populated):</h5>
                            <div className="flex flex-wrap gap-1">
                              {requiredFields.filter(f => !systemFields.has(f.name)).slice(0, 10).map((field: any, idx: number) => (
                                <span key={idx} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                                  {field.name} ({field.type})
                                </span>
                              ))}
                              {requiredFields.filter(f => !systemFields.has(f.name)).length > 10 && (
                                <span className="text-xs text-gray-500">+{requiredFields.filter(f => !systemFields.has(f.name)).length - 10} more</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Generation Settings Summary */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Generation Settings</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center">
              <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-sm text-gray-700">
                {session.globalSettings?.respectRequiredFields ? 'Will populate required fields' : 'Skip required fields'}
              </span>
            </div>
            <div className="flex items-center">
              <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-sm text-gray-700">
                {session.globalSettings?.createTestData ? 'Generate realistic test data' : 'Generate random data'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Important Notice */}
      <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-800 font-medium mb-1">Important:</p>
            <ul className="text-amber-700 space-y-1">
              <li>• This will create real data in your Salesforce org</li>
              <li>• Generated records cannot be easily bulk deleted</li>
              <li>• Consider using a sandbox or developer org for testing</li>
              <li>• Large datasets may impact org performance during generation</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button onClick={() => onPrevious('configuration')} className="btn-outline">
          Back to Configuration
        </button>
        <button 
          onClick={handleStartGeneration}
          disabled={isGenerating || generationSummary.totalRecords === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Starting Generation...
            </>
          ) : (
            <>
              <PlayIcon className="h-4 w-4 mr-2" />
              Start Generation ({generationSummary.totalRecords.toLocaleString()} records)
            </>
          )}
        </button>
      </div>
    </div>
  );
}
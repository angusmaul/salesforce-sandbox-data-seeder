import React, { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon,
  XMarkIcon,
  ClockIcon,
  CpuChipIcon
} from '@heroicons/react/24/outline';

interface ValidationError {
  type: 'missing_data' | 'invalid_value' | 'business_rule_violation' | 'system_constraint';
  field: string;
  message: string;
  severity: 'critical' | 'major' | 'minor';
  suggestedFix?: string;
}

interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'data_quality' | 'user_experience';
  field: string;
  message: string;
  impact: 'high' | 'medium' | 'low';
  recommendation?: string;
}

interface ConfigurationChange {
  type: 'object_selection' | 'record_count' | 'field_configuration' | 'global_setting' | 'step_navigation';
  description: string;
  before: any;
  after: any;
  impact: string;
}

interface ConfigurationConfirmationData {
  summary: string;
  changes: ConfigurationChange[];
  estimatedRecords: number;
  estimatedTime: string;
  riskLevel: 'low' | 'medium' | 'high';
  prerequisites: string[];
  consequences: string[];
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
  suggestions?: string[];
}

interface ConfigurationConfirmationProps {
  isOpen: boolean;
  data: ConfigurationConfirmationData | null;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const ConfigurationConfirmation: React.FC<ConfigurationConfirmationProps> = ({
  isOpen,
  data,
  onConfirm,
  onCancel,
  onClose,
  isLoading = false
}) => {
  const [currentTab, setCurrentTab] = useState<'summary' | 'changes' | 'validation'>('summary');

  useEffect(() => {
    if (isOpen && data) {
      // Default to validation tab if there are errors or warnings
      if ((data.errors && data.errors.length > 0) || (data.warnings && data.warnings.length > 0)) {
        setCurrentTab('validation');
      } else {
        setCurrentTab('summary');
      }
    }
  }, [isOpen, data]);

  if (!isOpen || !data) {
    return null;
  }

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'text-green-800 bg-green-100 border-green-200';
      case 'medium': return 'text-yellow-800 bg-yellow-100 border-yellow-200';
      case 'high': return 'text-red-800 bg-red-100 border-red-200';
      default: return 'text-gray-800 bg-gray-100 border-gray-200';
    }
  };

  const getRiskLevelIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'medium': return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />;
      case 'high': return <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />;
      default: return <InformationCircleIcon className="h-5 w-5 text-gray-600" />;
    }
  };

  const hasErrors = data.errors && data.errors.length > 0;
  const hasWarnings = data.warnings && data.warnings.length > 0;
  const criticalErrors = data.errors?.filter(e => e.severity === 'critical') || [];
  const canProceed = criticalErrors.length === 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCancel} />
        
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full sm:p-6">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <CpuChipIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Configuration Confirmation
                </h3>
                <p className="text-sm text-gray-600">
                  Review your data generation settings before applying
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Risk Level Banner */}
          <div className={`rounded-lg border p-4 mb-6 ${getRiskLevelColor(data.riskLevel)}`}>
            <div className="flex items-center space-x-2">
              {getRiskLevelIcon(data.riskLevel)}
              <div>
                <div className="font-medium">
                  Risk Level: {data.riskLevel.toUpperCase()}
                </div>
                <div className="text-sm">{data.summary}</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setCurrentTab('summary')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentTab === 'summary'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setCurrentTab('changes')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentTab === 'changes'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Changes ({data.changes.length})
              </button>
              <button
                onClick={() => setCurrentTab('validation')}
                className={`py-2 px-1 border-b-2 font-medium text-sm relative ${
                  currentTab === 'validation'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Validation
                {(hasErrors || hasWarnings) && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">
                    {(data.errors?.length || 0) + (data.warnings?.length || 0)}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px] mb-6">
            {currentTab === 'summary' && (
              <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">
                      {data.estimatedRecords.toLocaleString()}
                    </div>
                    <div className="text-sm text-blue-700">Estimated Records</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <ClockIcon className="h-5 w-5 text-green-600" />
                      <div className="text-lg font-semibold text-green-600">
                        {data.estimatedTime}
                      </div>
                    </div>
                    <div className="text-sm text-green-700">Estimated Time</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-600">
                      {data.changes.length}
                    </div>
                    <div className="text-sm text-purple-700">Configuration Changes</div>
                  </div>
                </div>

                {/* Prerequisites */}
                {data.prerequisites.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Prerequisites</h4>
                    <ul className="space-y-1">
                      {data.prerequisites.map((prerequisite, index) => (
                        <li key={index} className="flex items-center space-x-2 text-sm text-gray-600">
                          <CheckCircleIcon className="h-4 w-4 text-green-500" />
                          <span>{prerequisite}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Consequences */}
                {data.consequences.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">What will happen</h4>
                    <ul className="space-y-1">
                      {data.consequences.map((consequence, index) => (
                        <li key={index} className="flex items-center space-x-2 text-sm text-gray-600">
                          <InformationCircleIcon className="h-4 w-4 text-blue-500" />
                          <span>{consequence}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggestions */}
                {data.suggestions && data.suggestions.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Suggestions</h4>
                    <ul className="space-y-1">
                      {data.suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-center space-x-2 text-sm text-gray-600">
                          <InformationCircleIcon className="h-4 w-4 text-yellow-500" />
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {currentTab === 'changes' && (
              <div className="space-y-4">
                {data.changes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No changes detected
                  </div>
                ) : (
                  data.changes.map((change, index) => (
                    <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{change.description}</h4>
                        <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                          {change.type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{change.impact}</p>
                      
                      {/* Before/After comparison */}
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="font-medium text-red-700 mb-1">Before:</div>
                          <pre className="bg-red-50 p-2 rounded text-red-800 overflow-x-auto">
                            {JSON.stringify(change.before, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="font-medium text-green-700 mb-1">After:</div>
                          <pre className="bg-green-50 p-2 rounded text-green-800 overflow-x-auto">
                            {JSON.stringify(change.after, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {currentTab === 'validation' && (
              <div className="space-y-6">
                {/* Errors */}
                {hasErrors && (
                  <div>
                    <h4 className="font-medium text-red-900 mb-3 flex items-center space-x-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                      <span>Errors ({data.errors!.length})</span>
                    </h4>
                    <div className="space-y-2">
                      {data.errors!.map((error, index) => (
                        <div key={index} className={`border rounded-lg p-3 ${
                          error.severity === 'critical' ? 'border-red-300 bg-red-50' :
                          error.severity === 'major' ? 'border-orange-300 bg-orange-50' :
                          'border-yellow-300 bg-yellow-50'
                        }`}>
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-medium text-gray-900">{error.message}</div>
                            <span className={`text-xs px-2 py-1 rounded ${
                              error.severity === 'critical' ? 'bg-red-200 text-red-800' :
                              error.severity === 'major' ? 'bg-orange-200 text-orange-800' :
                              'bg-yellow-200 text-yellow-800'
                            }`}>
                              {error.severity}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">Field: {error.field}</div>
                          {error.suggestedFix && (
                            <div className="text-sm text-blue-600 mt-1">
                              💡 {error.suggestedFix}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {hasWarnings && (
                  <div>
                    <h4 className="font-medium text-yellow-900 mb-3 flex items-center space-x-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                      <span>Warnings ({data.warnings!.length})</span>
                    </h4>
                    <div className="space-y-2">
                      {data.warnings!.map((warning, index) => (
                        <div key={index} className="border border-yellow-300 bg-yellow-50 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-medium text-gray-900">{warning.message}</div>
                            <span className={`text-xs px-2 py-1 rounded ${
                              warning.impact === 'high' ? 'bg-red-200 text-red-800' :
                              warning.impact === 'medium' ? 'bg-orange-200 text-orange-800' :
                              'bg-yellow-200 text-yellow-800'
                            }`}>
                              {warning.impact} impact
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">Field: {warning.field}</div>
                          {warning.recommendation && (
                            <div className="text-sm text-blue-600 mt-1">
                              💡 {warning.recommendation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No issues */}
                {!hasErrors && !hasWarnings && (
                  <div className="text-center py-8">
                    <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <div className="text-lg font-medium text-gray-900">All Clear!</div>
                    <div className="text-gray-600">No validation issues found</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              {!canProceed && (
                <div className="flex items-center space-x-1 text-red-600">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  <span>Critical errors must be resolved before proceeding</span>
                </div>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              
              <button
                onClick={onConfirm}
                disabled={!canProceed || isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Applying...</span>
                  </>
                ) : (
                  <span>Confirm & Apply</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationConfirmation;
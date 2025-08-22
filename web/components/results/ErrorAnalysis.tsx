import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Download } from 'lucide-react';

interface ErrorAnalysisProps {
  errorAnalysis: {
    totalErrors: number;
    objectsWithErrors: string[];
    mostCommonErrors: Array<{
      error: string;
      count: number;
    }>;
    errorsByObject: Array<{
      name: string;
      errorCount: number;
      errors: Array<{
        statusCode: string;
        message: string;
        fields?: string[];
      }>;
    }>;
  };
  loadSessionId: string;
}

export default function ErrorAnalysis({ errorAnalysis, loadSessionId }: ErrorAnalysisProps) {
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const toggleObjectExpansion = (objectName: string) => {
    const newExpanded = new Set(expandedObjects);
    if (newExpanded.has(objectName)) {
      newExpanded.delete(objectName);
    } else {
      newExpanded.add(objectName);
    }
    setExpandedObjects(newExpanded);
  };

  const toggleErrorExpansion = (index: number) => {
    const newExpanded = new Set(expandedErrors);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedErrors(newExpanded);
  };

  if (errorAnalysis.totalErrors === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center">
          <div className="text-green-600 mr-3">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-green-900">Perfect Success!</h3>
            <p className="text-green-700">All records were loaded successfully without any errors.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <AlertTriangle className="text-amber-500 mr-2" size={20} />
            Error Analysis
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {errorAnalysis.totalErrors} total errors across {errorAnalysis.objectsWithErrors.length} objects
          </p>
        </div>

        <div className="p-6">
          {/* Most Common Errors */}
          <div className="mb-6">
            <h4 className="text-md font-medium text-gray-900 mb-3">Most Common Errors</h4>
            <div className="space-y-2">
              {(errorAnalysis.mostCommonErrors || []).slice(0, 5).map((error, index) => (
                <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div 
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => toggleErrorExpansion(index)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center">
                        {expandedErrors.has(index) ? 
                          <ChevronDown className="text-gray-400 mr-2" size={16} /> : 
                          <ChevronRight className="text-gray-400 mr-2" size={16} />
                        }
                        <span className="text-sm font-medium text-red-900">
                          {error.error.split(':')[0]}
                        </span>
                      </div>
                      {expandedErrors.has(index) && (
                        <div className="mt-2 ml-6">
                          <p className="text-sm text-red-700">{error.error}</p>
                        </div>
                      )}
                    </div>
                    <div className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                      {error.count} occurrence{error.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Errors by Object */}
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Errors by Object</h4>
            <div className="space-y-3">
              {errorAnalysis.errorsByObject.map((objectError) => (
                <div key={objectError.name} className="border border-gray-200 rounded-lg">
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleObjectExpansion(objectError.name)}
                  >
                    <div className="flex items-center">
                      {expandedObjects.has(objectError.name) ? 
                        <ChevronDown className="text-gray-400 mr-2" size={16} /> : 
                        <ChevronRight className="text-gray-400 mr-2" size={16} />
                      }
                      <span className="font-medium text-gray-900">{objectError.name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({objectError.errorCount} errors)
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logs/${loadSessionId}_${objectError.name}.json`, '_blank');
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                    >
                      <Download size={14} className="mr-1" />
                      View Log
                    </button>
                  </div>
                  
                  {expandedObjects.has(objectError.name) && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <div className="space-y-2 mt-3">
                        {(objectError.errors || []).slice(0, 3).map((error, errorIndex) => (
                          <div key={errorIndex} className="bg-gray-50 rounded p-3">
                            <div className="text-sm font-medium text-gray-900">
                              {error.statusCode}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">
                              {error.message}
                            </div>
                            {error.fields && error.fields.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1">
                                Fields: {error.fields.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                        {objectError.errors.length > 3 && (
                          <p className="text-sm text-gray-500 italic">
                            ... and {objectError.errors.length - 3} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
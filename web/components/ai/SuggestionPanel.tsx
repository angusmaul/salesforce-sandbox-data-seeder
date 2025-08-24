import React, { useState, useEffect } from 'react';
import { 
  LightBulbIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
  ArrowPathIcon,
  ChartBarIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

interface FieldSuggestion {
  value: any;
  confidence: number;
  reasoning: string;
  businessContext?: string;
  industry?: string;
}

interface BusinessScenario {
  name: string;
  description: string;
  industry: string;
}

interface SuggestionPanelProps {
  sessionId: string;
  objectName: string;
  fieldName: string;
  fieldType: string;
  fieldMetadata?: any;
  businessContext?: any;
  onSuggestionAccepted?: (suggestion: FieldSuggestion) => void;
  onSuggestionRejected?: (suggestion: FieldSuggestion) => void;
  onSuggestionModified?: (originalSuggestion: FieldSuggestion, modifiedValue: any) => void;
  className?: string;
  disabled?: boolean;
}

interface SuggestionItemProps {
  suggestion: FieldSuggestion;
  onAccept: () => void;
  onReject: () => void;
  onModify: (value: any) => void;
  isAccepted?: boolean;
  isRejected?: boolean;
}

const SuggestionItem: React.FC<SuggestionItemProps> = ({
  suggestion,
  onAccept,
  onReject,
  onModify,
  isAccepted,
  isRejected
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(suggestion.value?.toString() || '');

  const handleEditSave = () => {
    onModify(editValue);
    setIsEditing(false);
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <div className={`p-3 border rounded-lg transition-all ${
      isAccepted ? 'border-green-200 bg-green-50' :
      isRejected ? 'border-red-200 bg-red-50' :
      'border-gray-200 bg-white hover:border-blue-200'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          {isEditing ? (
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                autoFocus
              />
              <button
                onClick={handleEditSave}
                className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditValue(suggestion.value?.toString() || '');
                }}
                className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="font-mono text-sm mb-2 p-2 bg-gray-50 rounded">
              {formatValue(suggestion.value)}
            </div>
          )}
          
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(suggestion.confidence)}`}>
              {getConfidenceText(suggestion.confidence)} ({Math.round(suggestion.confidence * 100)}%)
            </span>
            
            {suggestion.businessContext && (
              <span className="px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-600">
                {suggestion.businessContext}
              </span>
            )}
            
            {suggestion.industry && (
              <span className="px-2 py-1 rounded-full text-xs bg-purple-50 text-purple-600">
                {suggestion.industry}
              </span>
            )}
          </div>
          
          <p className="text-sm text-gray-600">{suggestion.reasoning}</p>
        </div>
        
        <div className="flex gap-1 ml-3">
          {!isAccepted && !isRejected && (
            <>
              <button
                onClick={onAccept}
                className="p-1 text-green-600 hover:bg-green-50 rounded"
                title="Accept suggestion"
              >
                <CheckIcon className="h-4 w-4" />
              </button>
              
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                title="Edit suggestion"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
              
              <button
                onClick={onReject}
                className="p-1 text-red-600 hover:bg-red-50 rounded"
                title="Reject suggestion"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </>
          )}
          
          {isAccepted && (
            <div className="flex items-center text-green-600 text-xs">
              <CheckIcon className="h-4 w-4 mr-1" />
              Accepted
            </div>
          )}
          
          {isRejected && (
            <div className="flex items-center text-red-600 text-xs">
              <XMarkIcon className="h-4 w-4 mr-1" />
              Rejected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
  sessionId,
  objectName,
  fieldName,
  fieldType,
  fieldMetadata,
  businessContext,
  onSuggestionAccepted,
  onSuggestionRejected,
  onSuggestionModified,
  className = '',
  disabled = false
}) => {
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessScenarios, setBusinessScenarios] = useState<BusinessScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [interactions, setInteractions] = useState<{[key: string]: 'accepted' | 'rejected' | 'modified'}>({});

  useEffect(() => {
    fetchBusinessScenarios();
  }, []);

  useEffect(() => {
    if (objectName && fieldName && fieldType && !disabled) {
      fetchSuggestions();
    }
  }, [objectName, fieldName, fieldType, selectedScenario, disabled]);

  const fetchBusinessScenarios = async () => {
    try {
      const response = await fetch('/api/suggestions/business-scenarios');
      const result = await response.json();
      
      if (result.success) {
        setBusinessScenarios(result.scenarios);
      } else {
        console.error('Failed to fetch business scenarios:', result.error);
      }
    } catch (error) {
      console.error('Error fetching business scenarios:', error);
    }
  };

  const fetchSuggestions = async () => {
    if (!objectName || !fieldName || !fieldType) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const requestBody = {
        objectName,
        fieldName,
        fieldType,
        fieldMetadata,
        businessContext: {
          ...businessContext,
          scenario: selectedScenario || businessContext?.scenario
        }
      };

      const response = await fetch(`/api/suggestions/field/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (result.success) {
        setSuggestions(result.suggestions || []);
        setInteractions({}); // Reset interactions for new suggestions
      } else {
        setError(result.error || 'Failed to fetch suggestions');
        setSuggestions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const recordInteraction = async (suggestionId: string, action: 'accepted' | 'rejected' | 'modified', modifiedValue?: any, suggestion?: FieldSuggestion) => {
    try {
      // Record for suggestion metrics
      await fetch('/api/suggestions/record-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          suggestionId,
          action,
          modifiedValue
        })
      });

      // Record for A/B testing
      const startTime = performance.now();
      await fetch('/api/ab-testing/interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          suggestionId,
          objectName,
          fieldName,
          action,
          confidence: suggestion?.confidence || 0,
          businessContext: suggestion?.businessContext,
          timeToDecision: startTime, // Would be calculated properly in real implementation
          originalValue: suggestion?.value,
          finalValue: modifiedValue || suggestion?.value
        })
      });
    } catch (error) {
      console.error('Failed to record suggestion interaction:', error);
    }
  };

  const handleSuggestionAccept = (suggestion: FieldSuggestion, index: number) => {
    const suggestionId = `${objectName}_${fieldName}_${index}`;
    setInteractions(prev => ({ ...prev, [suggestionId]: 'accepted' }));
    recordInteraction(suggestionId, 'accepted', undefined, suggestion);
    onSuggestionAccepted?.(suggestion);
    toast.success('Suggestion accepted!');
  };

  const handleSuggestionReject = (suggestion: FieldSuggestion, index: number) => {
    const suggestionId = `${objectName}_${fieldName}_${index}`;
    setInteractions(prev => ({ ...prev, [suggestionId]: 'rejected' }));
    recordInteraction(suggestionId, 'rejected', undefined, suggestion);
    onSuggestionRejected?.(suggestion);
    toast.success('Suggestion rejected');
  };

  const handleSuggestionModify = (suggestion: FieldSuggestion, index: number, modifiedValue: any) => {
    const suggestionId = `${objectName}_${fieldName}_${index}`;
    setInteractions(prev => ({ ...prev, [suggestionId]: 'modified' }));
    recordInteraction(suggestionId, 'modified', modifiedValue, suggestion);
    onSuggestionModified?.(suggestion, modifiedValue);
    toast.success('Suggestion modified and accepted!');
  };

  if (disabled) {
    return (
      <div className={`p-4 bg-gray-50 border border-gray-200 rounded-lg ${className}`}>
        <div className="flex items-center text-gray-500">
          <ExclamationCircleIcon className="h-5 w-5 mr-2" />
          <span className="text-sm">AI suggestions disabled</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border border-gray-200 rounded-lg bg-white ${className}`}>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <LightBulbIcon className="h-5 w-5 text-yellow-500 mr-2" />
            <h3 className="font-medium text-gray-900">AI Field Suggestions</h3>
            {loading && (
              <ArrowPathIcon className="h-4 w-4 text-blue-500 ml-2 animate-spin" />
            )}
          </div>
          
          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="text-sm text-gray-600 mb-3">
          <span className="font-medium">{objectName}.{fieldName}</span> ({fieldType})
        </div>

        {businessScenarios.length > 0 && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Context:
            </label>
            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Default (No specific scenario)</option>
              {businessScenarios.map((scenario, index) => (
                <option key={index} value={scenario.name}>
                  {scenario.name} - {scenario.description}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <p className="font-medium">Failed to load suggestions</p>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {loading && !error && (
          <div className="flex items-center justify-center py-8">
            <ArrowPathIcon className="h-6 w-6 text-blue-500 animate-spin mr-2" />
            <span className="text-gray-600">Generating AI suggestions...</span>
          </div>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <LightBulbIcon className="h-6 w-6 mr-2" />
            <span>No suggestions available</span>
          </div>
        )}

        {!loading && !error && suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => {
              const suggestionId = `${objectName}_${fieldName}_${index}`;
              const interaction = interactions[suggestionId];
              
              return (
                <SuggestionItem
                  key={index}
                  suggestion={suggestion}
                  onAccept={() => handleSuggestionAccept(suggestion, index)}
                  onReject={() => handleSuggestionReject(suggestion, index)}
                  onModify={(value) => handleSuggestionModify(suggestion, index, value)}
                  isAccepted={interaction === 'accepted'}
                  isRejected={interaction === 'rejected'}
                />
              );
            })}
            
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Powered by Claude AI</span>
                <div className="flex items-center gap-4">
                  <span>
                    Accepted: {Object.values(interactions).filter(i => i === 'accepted').length}
                  </span>
                  <span>
                    Rejected: {Object.values(interactions).filter(i => i === 'rejected').length}
                  </span>
                  <span>
                    Modified: {Object.values(interactions).filter(i => i === 'modified').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuggestionPanel;
import React, { useState, useCallback } from 'react';
import { XMarkIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';

export interface ClarificationRequest {
  type: 'ambiguous_object' | 'unclear_count' | 'missing_relationship' | 'conflicting_requirements';
  question: string;
  options?: string[];
  context: string;
  priority: 'high' | 'medium' | 'low';
}

interface ClarificationModalProps {
  isOpen: boolean;
  clarifications: ClarificationRequest[];
  onClose: () => void;
  onSubmit: (responses: ClarificationResponse[]) => void;
  onCancel: () => void;
}

export interface ClarificationResponse {
  type: string;
  question: string;
  response: string;
  selectedOption?: string;
}

export const ClarificationModal: React.FC<ClarificationModalProps> = ({
  isOpen,
  clarifications,
  onClose,
  onSubmit,
  onCancel
}) => {
  const [responses, setResponses] = useState<{ [key: string]: ClarificationResponse }>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initialize responses when clarifications change
  React.useEffect(() => {
    if (clarifications.length > 0) {
      const initialResponses: { [key: string]: ClarificationResponse } = {};
      clarifications.forEach((clarification, index) => {
        initialResponses[index] = {
          type: clarification.type,
          question: clarification.question,
          response: '',
          selectedOption: undefined
        };
      });
      setResponses(initialResponses);
    }
  }, [clarifications]);

  const handleOptionSelect = useCallback((clarificationIndex: number, option: string) => {
    setResponses(prev => ({
      ...prev,
      [clarificationIndex]: {
        ...prev[clarificationIndex],
        selectedOption: option,
        response: option
      }
    }));
  }, []);

  const handleTextResponse = useCallback((clarificationIndex: number, text: string) => {
    setResponses(prev => ({
      ...prev,
      [clarificationIndex]: {
        ...prev[clarificationIndex],
        response: text,
        selectedOption: undefined
      }
    }));
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < clarifications.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, clarifications.length]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleSubmit = useCallback(() => {
    const responseList = Object.values(responses).filter(r => r.response.trim() !== '');
    onSubmit(responseList);
    onClose();
  }, [responses, onSubmit, onClose]);

  const canSubmit = () => {
    const highPriorityClarifications = clarifications.filter(c => c.priority === 'high');
    const highPriorityResponses = highPriorityClarifications.filter((_, index) => {
      const response = responses[index];
      return response && response.response.trim() !== '';
    });
    
    return highPriorityResponses.length === highPriorityClarifications.length;
  };

  if (!isOpen || clarifications.length === 0) {
    return null;
  }

  const currentClarification = clarifications[currentIndex];
  const currentResponse = responses[currentIndex];

  const priorityColors = {
    high: 'border-red-200 bg-red-50',
    medium: 'border-yellow-200 bg-yellow-50',
    low: 'border-blue-200 bg-blue-50'
  };

  const priorityIcons = {
    high: '🔴',
    medium: '🟡', 
    low: '🔵'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCancel} />
        
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <QuestionMarkCircleIcon className="h-6 w-6 text-blue-600" />
              <h3 className="text-lg font-medium text-gray-900">
                I need some clarification
              </h3>
            </div>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Progress indicator */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Question {currentIndex + 1} of {clarifications.length}</span>
              <span className="flex items-center space-x-1">
                <span>{priorityIcons[currentClarification.priority]}</span>
                <span className="capitalize">{currentClarification.priority} priority</span>
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / clarifications.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Current clarification */}
          <div className={`border rounded-lg p-4 mb-4 ${priorityColors[currentClarification.priority]}`}>
            <h4 className="font-medium text-gray-900 mb-2">
              {currentClarification.question}
            </h4>
            
            {currentClarification.context && (
              <p className="text-sm text-gray-600 mb-3">
                Context: {currentClarification.context}
              </p>
            )}

            {/* Options or text input */}
            {currentClarification.options && currentClarification.options.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-700 mb-2">Please select one:</p>
                {currentClarification.options.map((option, optionIndex) => (
                  <button
                    key={optionIndex}
                    onClick={() => handleOptionSelect(currentIndex, option)}
                    className={`w-full text-left p-3 rounded border transition-colors ${
                      currentResponse?.selectedOption === option
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        currentResponse?.selectedOption === option
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {currentResponse?.selectedOption === option && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <span>{option}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Your answer:
                </label>
                <textarea
                  value={currentResponse?.response || ''}
                  onChange={(e) => handleTextResponse(currentIndex, e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Please provide your answer..."
                />
              </div>
            )}
          </div>

          {/* Navigation and action buttons */}
          <div className="flex justify-between items-center">
            <div className="flex space-x-2">
              <button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              {currentIndex < clarifications.length - 1 ? (
                <button
                  onClick={handleNext}
                  className="px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit()}
                  className="px-3 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Answers
                </button>
              )}
            </div>

            <button
              onClick={onCancel}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {/* Help text */}
          <div className="mt-4 text-xs text-gray-500">
            {currentClarification.priority === 'high' ? (
              <p>⚠️ This question is required to continue with your configuration.</p>
            ) : (
              <p>💡 This question is optional but helps me provide better results.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClarificationModal;
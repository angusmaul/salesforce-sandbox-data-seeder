import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { WizardStep } from '../../shared/types/api';

interface ClaudeAssistantProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  currentStep: WizardStep;
}

export default function ClaudeAssistant({ 
  open, 
  onClose, 
  sessionId, 
  currentStep 
}: ClaudeAssistantProps) {
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">Claude AI assistant implementation in progress...</p>
            <p className="text-sm text-yellow-600 mt-2">
              Current step: {currentStep}<br />
              Session: {sessionId ? sessionId.slice(0, 8) + '...' : 'Loading...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
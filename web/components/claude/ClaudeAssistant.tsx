import React, { useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { WizardStep, ClaudeAction, ConfigurationUpdate } from '../../shared/types/api';
import { ChatInterface } from '../ai/ChatInterface';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSession } from '../../hooks/useSession';

interface ClaudeAssistantProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  currentStep: WizardStep;
  onStepChange?: (step: WizardStep) => Promise<void>;
  onSessionUpdate?: () => void;
}

export default function ClaudeAssistant({ 
  open, 
  onClose, 
  sessionId, 
  currentStep,
  onStepChange,
  onSessionUpdate
}: ClaudeAssistantProps) {
  const socket = useWebSocket(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001');
  const { session, updateConfiguration, navigateToStep } = useSession(sessionId);

  // Handle configuration updates from chat
  const handleConfigurationUpdate = useCallback(async (configUpdate: ConfigurationUpdate) => {
    try {
      const success = await updateConfiguration(configUpdate);
      if (success && onSessionUpdate) {
        onSessionUpdate(); // Notify parent of session update
      }
      return success;
    } catch (error) {
      console.error('Configuration update failed:', error);
      return false;
    }
  }, [updateConfiguration, onSessionUpdate]);

  // Handle step navigation from chat
  const handleStepNavigation = useCallback(async (step: WizardStep) => {
    try {
      const success = await navigateToStep(step);
      if (success) {
        if (onStepChange) {
          await onStepChange(step); // Notify parent of step change
        }
        if (onSessionUpdate) {
          onSessionUpdate(); // Notify parent of session update
        }
      }
      return success;
    } catch (error) {
      console.error('Step navigation failed:', error);
      return false;
    }
  }, [navigateToStep, onStepChange, onSessionUpdate]);

  // Handle action clicks from the chat interface (legacy support)
  const handleActionClick = useCallback((action: ClaudeAction) => {
    console.log('AI Assistant action clicked:', action);
    
    // These are handled internally by ChatInterface now, but kept for backwards compatibility
    switch (action.type) {
      case 'navigate':
        if (action.data?.step) {
          handleStepNavigation(action.data.step);
        }
        break;
      case 'configure':
        if (action.data?.configuration) {
          handleConfigurationUpdate(action.data.configuration);
        }
        break;
      default:
        console.log('Unhandled action:', action);
    }
  }, [handleStepNavigation, handleConfigurationUpdate]);

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <ChatInterface
            sessionId={sessionId}
            socket={socket}
            wizardSession={session || undefined}
            className="h-full"
            maxHeight="calc(100vh - 120px)"
            placeholder={`Ask me about ${currentStep} or anything else...`}
            onActionClick={handleActionClick}
            onConfigurationUpdate={handleConfigurationUpdate}
            onStepNavigation={handleStepNavigation}
          />
        </div>
      </div>
    </div>
  );
}
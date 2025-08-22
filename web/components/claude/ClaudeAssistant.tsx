import React, { useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { WizardStep, ClaudeAction } from '../../shared/types/api';
import { ChatInterface } from '../ai/ChatInterface';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSession } from '../../hooks/useSession';

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
  const socket = useWebSocket(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001');
  const { session } = useSession(sessionId);

  // Handle action clicks from the chat interface
  const handleActionClick = useCallback((action: ClaudeAction) => {
    console.log('AI Assistant action clicked:', action);
    
    switch (action.type) {
      case 'navigate':
        if (action.data?.step) {
          // Navigate to specific wizard step
          console.log('Navigate to step:', action.data.step);
          // This could trigger a step change through the parent wizard
        }
        break;
      case 'configure':
        if (action.data?.configuration) {
          // Apply configuration
          console.log('Apply configuration:', action.data.configuration);
          // This could update wizard session with new configuration
        }
        break;
      default:
        console.log('Unhandled action:', action);
    }
  }, []);

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
          />
        </div>
      </div>
    </div>
  );
}
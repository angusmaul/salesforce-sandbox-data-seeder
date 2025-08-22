import React from 'react';
import Link from 'next/link';
import { 
  CheckIcon, 
  ChatBubbleLeftRightIcon,
  HomeIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline';
import { WizardStep, WizardSession } from '../../shared/types/api';

interface WizardLayoutProps {
  steps: { id: WizardStep; title: string; description: string }[];
  currentStep: WizardStep;
  onStepClick: (stepId: WizardStep, stepIndex: number) => void;
  canNavigateToStep: (stepIndex: number) => boolean;
  session: WizardSession;
  onAssistantToggle: () => void;
  children: React.ReactNode;
}

export default function WizardLayout({
  steps,
  currentStep,
  onStepClick,
  canNavigateToStep,
  session,
  onAssistantToggle,
  children
}: WizardLayoutProps) {
  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  
  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < currentStepIndex) {
      return 'completed';
    } else if (stepIndex === currentStepIndex) {
      return 'active';
    } else {
      return 'pending';
    }
  };
  
  const getStepIcon = (stepIndex: number, status: string) => {
    if (status === 'completed') {
      return <CheckIcon className="h-5 w-5" />;
    } else {
      return <span className="text-sm font-medium">{stepIndex + 1}</span>;
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Title */}
            <div className="flex items-center">
              <Link href="/" className="flex items-center text-gray-600 hover:text-gray-900 transition-colors">
                <HomeIcon className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium">Home</span>
              </Link>
              <div className="mx-4 text-gray-300">|</div>
              <h1 className="text-lg font-semibold text-gray-900">
                Data Generation Wizard
              </h1>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center space-x-4">
              {session.connectionInfo && (
                <div className="flex items-center text-sm text-gray-600">
                  <div className="h-2 w-2 bg-green-400 rounded-full mr-2"></div>
                  <span>Connected to {session.connectionInfo.instanceUrl}</span>
                </div>
              )}
              
              {/* Assistant Toggle */}
              <button
                onClick={onAssistantToggle}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5 mr-1" />
                <span className="text-sm font-medium">AI Assistant</span>
              </button>
              
              {/* Help */}
              <button className="flex items-center text-gray-600 hover:text-gray-900 transition-colors">
                <QuestionMarkCircleIcon className="h-5 w-5 mr-1" />
                <span className="text-sm font-medium">Help</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar - Step Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                Progress
              </h2>
              
              <nav className="space-y-2">
                {steps.map((step, index) => {
                  const status = getStepStatus(index);
                  const canNavigate = canNavigateToStep(index);
                  
                  return (
                    <button
                      key={step.id}
                      onClick={() => canNavigate && onStepClick(step.id, index)}
                      disabled={!canNavigate}
                      className={`w-full flex items-center p-3 rounded-lg text-left transition-colors ${
                        status === 'active'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : status === 'completed'
                          ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                          : canNavigate
                          ? 'hover:bg-gray-50 text-gray-700'
                          : 'text-gray-400 cursor-not-allowed'
                      } ${canNavigate ? 'border' : 'border border-gray-200'}`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        status === 'active'
                          ? 'bg-blue-600 text-white'
                          : status === 'completed'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                      }`}>
                        {getStepIcon(index, status)}
                      </div>
                      
                      <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {step.title}
                        </p>
                        <p className="text-xs opacity-75 truncate">
                          {step.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </nav>
              
              {/* Progress Bar */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Overall Progress</span>
                  <span>{Math.round((currentStepIndex / (steps.length - 1)) * 100)}%</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* Session Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="text-xs text-gray-500 space-y-1">
                  <div>Session: {session.id ? session.id.slice(0, 8) + '...' : 'Loading...'}</div>
                  <div>Started: {new Date(session.createdAt).toLocaleTimeString()}</div>
                  {session.discoveredObjects && (
                    <div>Objects: {session.discoveredObjects.length}</div>
                  )}
                  {session.selectedObjects && (
                    <div>Selected: {session.selectedObjects.length}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
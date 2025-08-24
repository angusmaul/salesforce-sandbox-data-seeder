import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import WizardLayout from '../components/wizard/WizardLayout';
import AuthenticationStep from '../components/wizard/steps/AuthenticationStep';
import DiscoveryStep from '../components/wizard/steps/DiscoveryStep';
import SelectionStep from '../components/wizard/steps/SelectionStep';
import ConfigurationStep from '../components/wizard/steps/ConfigurationStep';
import PreviewStep from '../components/wizard/steps/PreviewStep';
import ExecutionStep from '../components/wizard/steps/ExecutionStep';
import ResultsStep from '../components/wizard/steps/ResultsStep';
import ClaudeAssistant from '../components/claude/ClaudeAssistant';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSession } from '../hooks/useSession';
import { WizardStep } from '../shared/types/api';

const WIZARD_STEPS: { id: WizardStep; title: string; description: string }[] = [
  {
    id: 'authentication',
    title: 'Authentication',
    description: 'Connect to your Salesforce sandbox'
  },
  {
    id: 'discovery',
    title: 'Discovery',
    description: 'Discover objects and relationships'
  },
  {
    id: 'selection',
    title: 'Selection',
    description: 'Choose objects to populate'
  },
  {
    id: 'configuration',
    title: 'Configuration',
    description: 'Configure record counts'
  },
  {
    id: 'preview',
    title: 'Preview',
    description: 'Review generated data'
  },
  {
    id: 'execution',
    title: 'Execution',
    description: 'Generate and load data'
  },
  {
    id: 'results',
    title: 'Results',
    description: 'View results and analysis'
  }
];

export default function WizardPage() {
  const router = useRouter();
  const { session: sessionId, error } = router.query;
  const [assistantOpen, setAssistantOpen] = useState(false);
  
  const { session, loading, updateSession, refreshSession, sessionId: currentSessionId } = useSession(sessionId as string);
  const socket = useWebSocket(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001');
  
  useEffect(() => {
    if (error) {
      toast.error(decodeURIComponent(error as string));
    }
  }, [error]);
  
  useEffect(() => {
    if (currentSessionId && socket) {
      socket.emit('join-session', currentSessionId);
      
      // Listen for real-time updates
      socket.on('progress', (update) => {
        console.log('Progress update:', update);
        // Handle progress updates in step components
      });
      
      socket.on('step-complete', (data) => {
        console.log('Step complete:', data);
        refreshSession();
        toast.success(`${data.step} completed successfully!`);
      });
      
      socket.on('error', (errorData) => {
        console.error('Socket error:', errorData);
        toast.error(errorData.error);
      });
      
      socket.on('log', (logData) => {
        console.log('Log:', logData);
        if (logData.level === 'error') {
          toast.error(logData.message);
        } else if (logData.level === 'success') {
          toast.success(logData.message);
        }
      });
      
      return () => {
        socket.off('progress');
        socket.off('step-complete');
        socket.off('error');
        socket.off('log');
      };
    }
  }, [currentSessionId, socket, refreshSession]);
  
  const handleStepChange = async (newStep: WizardStep) => {
    console.log('handleStepChange called with:', newStep, 'current session:', session);
    console.log('Session ID:', session?.id, 'Current step:', session?.currentStep);
    
    if (session) {
      try {
        console.log('Calling updateSession with currentStep:', newStep);
        const result = await updateSession({ currentStep: newStep });
        console.log('updateSession result:', result);
        
        if (result) {
          console.log('Step change successful, new step:', result.currentStep);
        } else {
          console.error('updateSession returned null/false');
        }
      } catch (error) {
        console.error('Error updating session:', error);
      }
    } else {
      console.log('No session available for step change');
    }
  };
  
  const getCurrentStepIndex = () => {
    if (!session) return 0;
    return WIZARD_STEPS.findIndex(step => step.id === session.currentStep);
  };
  
  const canNavigateToStep = (stepIndex: number) => {
    const currentIndex = getCurrentStepIndex();
    // Can navigate to current step, previous steps, or next step
    return stepIndex <= currentIndex + 1;
  };
  
  const renderCurrentStep = () => {
    if (!session) return null;
    
    const stepProps = {
      session,
      onNext: (newStep: WizardStep) => handleStepChange(newStep),
      onPrevious: (newStep: WizardStep) => handleStepChange(newStep),
      socket,
      updateSession
    };
    
    switch (session.currentStep) {
      case 'authentication':
        return <AuthenticationStep {...stepProps} />;
      case 'discovery':
        return <DiscoveryStep {...stepProps} />;
      case 'selection':
        return <SelectionStep {...stepProps} />;
      case 'configuration':
        return <ConfigurationStep {...stepProps} />;
      case 'preview':
        return <PreviewStep {...stepProps} />;
      case 'execution':
        return <ExecutionStep {...stepProps} />;
      case 'results':
        return <ResultsStep {...stepProps} />;
      default:
        return <AuthenticationStep {...stepProps} />;
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading wizard session...</p>
        </div>
      </div>
    );
  }
  
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Session Not Found</h1>
          <p className="text-gray-600 mb-6">
            The wizard session could not be found or has expired.
          </p>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Data Generation Wizard - Salesforce Sandbox Data Seeder</title>
        <meta name="description" content="Generate sample data for your Salesforce sandbox" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <WizardLayout
        steps={WIZARD_STEPS}
        currentStep={session.currentStep}
        onStepClick={(stepId, stepIndex) => {
          if (canNavigateToStep(stepIndex)) {
            handleStepChange(stepId);
          }
        }}
        canNavigateToStep={canNavigateToStep}
        session={session}
        onAssistantToggle={() => setAssistantOpen(!assistantOpen)}
      >
        {renderCurrentStep()}
      </WizardLayout>
      
      {/* Claude AI Assistant */}
      <ClaudeAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        sessionId={currentSessionId || session.id}
        currentStep={session.currentStep}
        onStepChange={async (step) => {
          await handleStepChange(step);
        }}
        onSessionUpdate={() => {
          refreshSession();
        }}
      />
    </>
  );
}
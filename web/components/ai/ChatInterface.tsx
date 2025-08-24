import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { MessageBubble } from './MessageBubble';
import { useAIChat } from '../../hooks/useAIChat';
import { ClaudeAction, WizardSession, ConfigurationUpdate, WizardStep } from '../../shared/types/api';
import ClarificationModal, { ClarificationRequest, ClarificationResponse } from './ClarificationModal';

interface ChatInterfaceProps {
  sessionId: string;
  socket: Socket | null;
  wizardSession?: Partial<WizardSession>;
  className?: string;
  maxHeight?: string;
  placeholder?: string;
  disabled?: boolean;
  onActionClick?: (action: ClaudeAction) => void;
  onConfigurationUpdate?: (update: ConfigurationUpdate) => Promise<boolean>;
  onStepNavigation?: (step: WizardStep) => Promise<boolean>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  sessionId,
  socket,
  wizardSession,
  className = '',
  maxHeight = '600px',
  placeholder = 'Ask me anything about your Salesforce data generation...',
  disabled = false,
  onActionClick,
  onConfigurationUpdate,
  onStepNavigation
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingConfigActions, setPendingConfigActions] = useState<ClaudeAction[]>([]);
  const [configurationPreview, setConfigurationPreview] = useState<ConfigurationUpdate | null>(null);
  const [showClarificationModal, setShowClarificationModal] = useState(false);
  const [clarificationRequests, setClarificationRequests] = useState<ClarificationRequest[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isTyping,
    isConnected,
    error,
    sendMessage,
    clearMessages,
    retryLastMessage,
    exportHistory
  } = useAIChat({
    sessionId,
    socket,
    wizardSession,
    maxMessages: 50,
    autoScroll: true
  });

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  // Handle message submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || isSending || disabled) return;
    
    const messageToSend = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    try {
      await sendMessage(messageToSend);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Error is handled by the hook
    } finally {
      setIsSending(false);
      
      // Focus back to input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [inputValue, isSending, disabled, sendMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  // Handle action clicks
  const handleActionClick = useCallback(async (action: ClaudeAction) => {
    // First try external handler
    if (onActionClick) {
      onActionClick(action);
      return;
    }

    // Handle built-in actions
    switch (action.type) {
      case 'retry':
        retryLastMessage().catch(console.error);
        break;

      case 'navigate':
        if (action.data?.step && onStepNavigation) {
          try {
            const success = await onStepNavigation(action.data.step);
            if (success) {
              await sendMessage(`✅ Navigated to ${action.data.step} step`);
            } else {
              await sendMessage(`❌ Could not navigate to ${action.data.step} step. Please check the requirements.`);
            }
          } catch (error) {
            console.error('Navigation error:', error);
            await sendMessage(`❌ Navigation failed: ${error}`);
          }
        } else {
          console.log('Navigate to step:', action.data?.step);
        }
        break;

      case 'configure':
      case 'apply_config':
        if (action.data?.configuration && onConfigurationUpdate) {
          if (action.requiresConfirmation) {
            // Store pending actions for confirmation
            setPendingConfigActions([action]);
            setConfigurationPreview(action.data.configuration);
          } else {
            // Apply directly
            try {
              const success = await onConfigurationUpdate(action.data.configuration);
              if (success) {
                await sendMessage(`✅ Configuration applied successfully`);
              } else {
                await sendMessage(`❌ Failed to apply configuration. Please check the values and try again.`);
              }
            } catch (error) {
              console.error('Configuration error:', error);
              await sendMessage(`❌ Configuration failed: ${error}`);
            }
          }
        } else {
          console.log('Apply configuration:', action.data?.configuration);
        }
        break;

      case 'confirm':
        // Apply pending configuration actions
        if (pendingConfigActions.length > 0 && configurationPreview && onConfigurationUpdate) {
          try {
            const success = await onConfigurationUpdate(configurationPreview);
            if (success) {
              await sendMessage(`✅ Configuration confirmed and applied successfully`);
              setPendingConfigActions([]);
              setConfigurationPreview(null);
            } else {
              await sendMessage(`❌ Failed to apply confirmed configuration`);
            }
          } catch (error) {
            console.error('Confirmation error:', error);
            await sendMessage(`❌ Confirmation failed: ${error}`);
          }
        }
        break;

      case 'cancel':
        // Clear pending actions
        setPendingConfigActions([]);
        setConfigurationPreview(null);
        await sendMessage(`Configuration changes cancelled`);
        break;

      case 'clarify':
        if (action.data?.clarifications) {
          setClarificationRequests(action.data.clarifications);
          setShowClarificationModal(true);
        } else if (action.data?.question) {
          await sendMessage(action.data.question);
        }
        break;

      case 'explain':
        // Send follow-up question
        const topic = action.data?.topic || 'the previous response';
        await sendMessage(`Can you explain more about: ${topic}`);
        break;

      default:
        console.log('Unhandled action:', action);
    }
  }, [onActionClick, retryLastMessage, sendMessage, onStepNavigation, onConfigurationUpdate, pendingConfigActions, configurationPreview]);

  // Handle clarification responses
  const handleClarificationSubmit = useCallback(async (responses: ClarificationResponse[]) => {
    setShowClarificationModal(false);
    setClarificationRequests([]);
    
    // Send clarification responses back to the AI
    const responseText = responses.map(r => `${r.question}: ${r.response}`).join('\n');
    await sendMessage(`Here are my clarifications:\n${responseText}`);
  }, [sendMessage]);

  const handleClarificationCancel = useCallback(() => {
    setShowClarificationModal(false);
    setClarificationRequests([]);
    sendMessage('I need to think about this more. Can you help me with something else?');
  }, [sendMessage]);

  // Handle retry for failed messages
  const handleMessageRetry = useCallback(() => {
    retryLastMessage().catch(console.error);
  }, [retryLastMessage]);

  // Handle export
  const handleExport = useCallback(() => {
    const historyText = exportHistory();
    const blob = new Blob([historyText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-history-${sessionId}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportHistory, sessionId]);

  // Connection status indicator
  const connectionStatus = isConnected ? 'connected' : 'disconnected';
  const statusColor = isConnected ? '#10b981' : '#ef4444';

  // Configuration preview component
  const renderConfigurationPreview = () => {
    if (!configurationPreview || pendingConfigActions.length === 0) {
      return null;
    }

    return (
      <div className="configuration-preview">
        <div className="preview-header">
          <span className="preview-icon">⚙️</span>
          <span className="preview-title">Configuration Preview</span>
        </div>
        <div className="preview-content">
          {configurationPreview.selectedObjects && (
            <div className="preview-section">
              <strong>Selected Objects:</strong>
              <ul>
                {configurationPreview.selectedObjects.map(obj => (
                  <li key={obj}>{obj}</li>
                ))}
              </ul>
            </div>
          )}
          {configurationPreview.configuration && (
            <div className="preview-section">
              <strong>Configuration:</strong>
              <pre>{JSON.stringify(configurationPreview.configuration, null, 2)}</pre>
            </div>
          )}
          {configurationPreview.globalSettings && (
            <div className="preview-section">
              <strong>Global Settings:</strong>
              <pre>{JSON.stringify(configurationPreview.globalSettings, null, 2)}</pre>
            </div>
          )}
        </div>
        <div className="preview-actions">
          <button
            className="preview-button confirm"
            onClick={() => handleActionClick({ type: 'confirm', label: 'Confirm' })}
          >
            ✅ Apply Changes
          </button>
          <button
            className="preview-button cancel"
            onClick={() => handleActionClick({ type: 'cancel', label: 'Cancel' })}
          >
            ❌ Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`chat-interface ${className} ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="chat-header">
        <div className="chat-title">
          <div className="title-content">
            <span className="chat-icon">🤖</span>
            <span className="title-text">AI Assistant</span>
            <div 
              className="connection-indicator"
              style={{ backgroundColor: statusColor }}
              title={`Status: ${connectionStatus}`}
            />
          </div>
          
          <div className="header-actions">
            <button
              className="header-button"
              onClick={handleExport}
              disabled={messages.length === 0}
              title="Export chat history"
              type="button"
            >
              📥
            </button>
            <button
              className="header-button"
              onClick={clearMessages}
              disabled={messages.length === 0}
              title="Clear chat history"
              type="button"
            >
              🗑️
            </button>
            <button
              className="header-button collapse-toggle"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? 'Expand chat' : 'Collapse chat'}
              type="button"
            >
              {isCollapsed ? '▲' : '▼'}
            </button>
          </div>
        </div>
        
        {error && (
          <div className="chat-error">
            <span className="error-icon">⚠️</span>
            <span className="error-message">{error}</span>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Configuration Preview */}
          {renderConfigurationPreview()}
          
          {/* Messages */}
          <div 
            className="chat-messages"
            style={{ maxHeight }}
            ref={messagesContainerRef}
          >
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <h3>Start a conversation</h3>
                <p>
                  I can help you with Salesforce data generation, validation rules, 
                  field suggestions, and more. Just ask me anything!
                </p>
                <div className="suggested-questions">
                  <p>Try asking:</p>
                  <ul>
                    <li>"How do I generate realistic account data?"</li>
                    <li>"What validation rules should I check for Contact records?"</li>
                    <li>"Help me configure my data generation settings"</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onActionClick={handleActionClick}
                    onRetry={message.metadata?.error ? handleMessageRetry : undefined}
                  />
                ))}
                
                {isTyping && (
                  <div className="typing-indicator">
                    <div className="typing-avatar">🤖</div>
                    <div className="typing-content">
                      <div className="typing-text">AI Assistant is typing</div>
                      <div className="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="chat-input-container">
            <form onSubmit={handleSubmit} className="chat-form">
              <div className="input-wrapper">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={disabled ? 'Chat is disabled' : placeholder}
                  className="chat-input"
                  disabled={disabled || isSending}
                  rows={1}
                />
                <button
                  type="submit"
                  className="send-button"
                  disabled={!inputValue.trim() || isSending || disabled || !isConnected}
                  title={
                    !isConnected ? 'Not connected' :
                    disabled ? 'Chat is disabled' :
                    !inputValue.trim() ? 'Enter a message' :
                    'Send message (Enter)'
                  }
                >
                  {isSending ? (
                    <span className="loading-spinner">⟳</span>
                  ) : (
                    <span className="send-icon">🚀</span>
                  )}
                </button>
              </div>
              
              <div className="input-footer">
                <div className="input-hint">
                  Press <kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for new line
                </div>
                {wizardSession?.currentStep && (
                  <div className="context-indicator">
                    Context: {wizardSession.currentStep}
                  </div>
                )}
              </div>
            </form>
          </div>
        </>
      )}
      
      {/* Clarification Modal */}
      <ClarificationModal
        isOpen={showClarificationModal}
        clarifications={clarificationRequests}
        onClose={() => setShowClarificationModal(false)}
        onSubmit={handleClarificationSubmit}
        onCancel={handleClarificationCancel}
      />
    </div>
  );
};
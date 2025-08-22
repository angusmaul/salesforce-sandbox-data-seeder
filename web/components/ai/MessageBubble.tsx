import React, { memo, useState } from 'react';
import { ChatMessage, ClaudeAction } from '../../shared/types/api';

interface MessageBubbleProps {
  message: ChatMessage;
  onActionClick?: (action: ClaudeAction) => void;
  onRetry?: () => void;
}

export const MessageBubble = memo(({ message, onActionClick, onRetry }: MessageBubbleProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isUser = message.role === 'user';
  const hasError = !!message.metadata?.error;
  const hasActions = message.metadata?.actions && message.metadata.actions.length > 0;
  const hasSuggestions = message.metadata?.suggestions && message.metadata.suggestions.length > 0;

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffMs = now.getTime() - messageTime.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    
    return messageTime.toLocaleDateString();
  };

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="inline-code">$1</code>')
      .replace(/```(\w+)?\n(.*?)```/gs, '<pre class="code-block"><code>$2</code></pre>')
      .replace(/\n/g, '<br>');
  };

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'} ${hasError ? 'error' : ''}`}>
      <div className="message-header">
        <div className="message-avatar">
          {isUser ? (
            <div className="user-avatar">
              <span>👤</span>
            </div>
          ) : (
            <div className="ai-avatar">
              <span>🤖</span>
            </div>
          )}
        </div>
        
        <div className="message-meta">
          <span className="message-role">
            {isUser ? 'You' : 'AI Assistant'}
          </span>
          <span className="message-timestamp">
            {formatTimestamp(message.timestamp)}
          </span>
          {message.isStreaming && (
            <span className="streaming-indicator">
              <span className="streaming-dot"></span>
              <span className="streaming-dot"></span>
              <span className="streaming-dot"></span>
            </span>
          )}
        </div>
      </div>
      
      <div className="message-content">
        <div 
          className="message-text" 
          dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
        />
        
        {hasError && (
          <div className="message-error">
            <div className="error-content">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{message.metadata?.error}</span>
              {onRetry && (
                <button 
                  className="retry-button"
                  onClick={onRetry}
                  type="button"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
        
        {hasSuggestions && (
          <div className="message-suggestions">
            <div className="suggestions-header">
              <span>💡 Suggestions:</span>
            </div>
            <ul className="suggestions-list">
              {message.metadata!.suggestions!.map((suggestion, index) => (
                <li key={index} className="suggestion-item">
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {hasActions && (
          <div className="message-actions">
            <div className="actions-header">
              <span>🔧 Quick Actions:</span>
            </div>
            <div className="actions-list">
              {message.metadata!.actions!.map((action, index) => (
                <button
                  key={index}
                  className={`action-button action-${action.type}`}
                  onClick={() => onActionClick?.(action)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {message.metadata && (
        <div className="message-footer">
          <button
            className="expand-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
          >
            {isExpanded ? '▲ Less info' : '▼ More info'}
          </button>
          
          {isExpanded && (
            <div className="message-metadata">
              {message.metadata.tokens && (
                <div className="metadata-item">
                  <span className="metadata-label">Tokens:</span>
                  <span className="metadata-value">{message.metadata.tokens}</span>
                </div>
              )}
              {message.metadata.responseTime && (
                <div className="metadata-item">
                  <span className="metadata-label">Response time:</span>
                  <span className="metadata-value">{message.metadata.responseTime}ms</span>
                </div>
              )}
              <div className="metadata-item">
                <span className="metadata-label">Message ID:</span>
                <span className="metadata-value">{message.id}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';
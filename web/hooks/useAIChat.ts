import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { 
  ChatMessage, 
  ChatSession, 
  StreamingChatRequest, 
  StreamingChatResponse, 
  WizardSession 
} from '../shared/types/api';
import { v4 as uuidv4 } from 'uuid';

interface UseAIChatOptions {
  sessionId: string;
  socket: Socket | null;
  wizardSession?: Partial<WizardSession>;
  maxMessages?: number;
  autoScroll?: boolean;
}

interface UseAIChatReturn {
  messages: ChatMessage[];
  isTyping: boolean;
  isConnected: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  exportHistory: () => string;
}

export function useAIChat({
  sessionId,
  socket,
  wizardSession,
  maxMessages = 100,
  autoScroll = true
}: UseAIChatOptions): UseAIChatReturn {
  const [chatSession, setChatSession] = useState<ChatSession>({
    sessionId,
    messages: [],
    lastActivity: new Date()
  });
  
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastMessageRef = useRef<ChatMessage | null>(null);
  const streamingMessageRef = useRef<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll]);

  // Initialize socket event listeners
  useEffect(() => {
    if (!socket) {
      setIsConnected(false);
      return;
    }

    // Connection status
    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
      
      // Join session room for chat updates
      socket.emit('join-session', sessionId);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsTyping(false);
    };

    const handleConnectError = (err: Error) => {
      setIsConnected(false);
      setError(`Connection error: ${err.message}`);
    };

    // Chat-specific event listeners
    const handleChatMessageChunk = (response: StreamingChatResponse) => {
      if (response.sessionId !== sessionId) return;
      
      setChatSession(prev => {
        const messages = [...prev.messages];
        
        // Find or create streaming message
        let streamingMessage = streamingMessageRef.current;
        if (!streamingMessage || streamingMessage.id !== response.messageId) {
          streamingMessage = {
            id: response.messageId,
            sessionId,
            role: 'assistant',
            content: '',
            timestamp: new Date(response.timestamp),
            isStreaming: true
          };
          messages.push(streamingMessage);
          streamingMessageRef.current = streamingMessage;
        }
        
        // Update content
        const messageIndex = messages.findIndex(msg => msg.id === response.messageId);
        if (messageIndex !== -1) {
          messages[messageIndex] = {
            ...messages[messageIndex],
            content: response.content,
            isStreaming: !response.isComplete,
            metadata: response.metadata
          };
          
          // Clear streaming ref when complete
          if (response.isComplete) {
            streamingMessageRef.current = null;
            setIsTyping(false);
          }
        }
        
        return {
          ...prev,
          messages: messages.slice(-maxMessages),
          lastActivity: new Date()
        };
      });
      
      // Auto-scroll for streaming messages
      setTimeout(scrollToBottom, 100);
    };

    const handleChatMessage = (message: ChatMessage) => {
      if (message.sessionId !== sessionId) return;
      
      setChatSession(prev => ({
        ...prev,
        messages: [...prev.messages, message].slice(-maxMessages),
        lastActivity: new Date()
      }));
      
      setTimeout(scrollToBottom, 100);
    };

    const handleTypingIndicator = ({ isTyping: typing }: { isTyping: boolean }) => {
      setIsTyping(typing);
      if (typing) {
        setTimeout(scrollToBottom, 100);
      }
    };

    const handleChatError = ({ messageId, error: errorMsg }: { messageId: string; error: string }) => {
      setError(errorMsg);
      setIsTyping(false);
      
      // Mark failed message
      setChatSession(prev => ({
        ...prev,
        messages: prev.messages.map(msg => 
          msg.id === messageId 
            ? { ...msg, metadata: { ...msg.metadata, error: errorMsg }, isStreaming: false }
            : msg
        )
      }));
    };

    const handleChatSessionStatus = ({ status, message }: { status: string; message?: string }) => {
      if (status === 'error') {
        setError(message || 'Chat session error');
      } else {
        setError(null);
      }
    };

    // Set up event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('chat-message-chunk', handleChatMessageChunk);
    socket.on('chat-message', handleChatMessage);
    socket.on('ai-typing', handleTypingIndicator);
    socket.on('chat-error', handleChatError);
    socket.on('chat-session-status', handleChatSessionStatus);

    // Initial connection state
    setIsConnected(socket.connected);
    if (socket.connected) {
      socket.emit('join-session', sessionId);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('chat-message-chunk', handleChatMessageChunk);
      socket.off('chat-message', handleChatMessage);
      socket.off('ai-typing', handleTypingIndicator);
      socket.off('chat-error', handleChatError);
      socket.off('chat-session-status', handleChatSessionStatus);
    };
  }, [socket, sessionId, maxMessages, scrollToBottom]);

  // Send message function
  const sendMessage = useCallback(async (content: string): Promise<void> => {
    if (!socket || !isConnected) {
      throw new Error('Not connected to chat service');
    }

    if (!content.trim()) {
      throw new Error('Message cannot be empty');
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    // Add user message immediately
    setChatSession(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage].slice(-maxMessages),
      lastActivity: new Date()
    }));

    // Store for potential retry
    lastMessageRef.current = userMessage;

    // Clear any previous errors
    setError(null);
    setIsTyping(true);

    try {
      // Send to streaming chat endpoint
      const request: StreamingChatRequest = {
        sessionId,
        message: content.trim(),
        context: {
          step: wizardSession?.currentStep || 'authentication',
          sessionData: wizardSession
        }
      };

      const response = await fetch(`/api/ai-chat/stream/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      setTimeout(scrollToBottom, 100);
    } catch (err) {
      setIsTyping(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      
      // Add error message to chat
      const errorChatMessage: ChatMessage = {
        id: uuidv4(),
        sessionId,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date(),
        metadata: { error: errorMessage }
      };
      
      setChatSession(prev => ({
        ...prev,
        messages: [...prev.messages, errorChatMessage].slice(-maxMessages),
        lastActivity: new Date()
      }));
      
      throw err;
    }
  }, [socket, isConnected, sessionId, wizardSession, maxMessages, scrollToBottom]);

  // Retry last message
  const retryLastMessage = useCallback(async (): Promise<void> => {
    if (!lastMessageRef.current) {
      throw new Error('No message to retry');
    }
    
    await sendMessage(lastMessageRef.current.content);
  }, [sendMessage]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setChatSession(prev => ({
      ...prev,
      messages: [],
      lastActivity: new Date()
    }));
    setError(null);
    setIsTyping(false);
    lastMessageRef.current = null;
    streamingMessageRef.current = null;
  }, []);

  // Export chat history
  const exportHistory = useCallback((): string => {
    const timestamp = new Date().toISOString();
    const header = `# AI Chat History - ${timestamp}\n\nSession: ${sessionId}\n\n`;
    
    const messages = chatSession.messages
      .map(msg => {
        const time = msg.timestamp.toLocaleString();
        const role = msg.role === 'user' ? 'You' : 'AI Assistant';
        const content = msg.content;
        const error = msg.metadata?.error ? ` (Error: ${msg.metadata.error})` : '';
        
        return `**${role}** (${time})${error}:\n${content}\n`;
      })
      .join('\n---\n\n');
    
    return header + messages;
  }, [chatSession.messages, sessionId]);

  // Provide ref for external scroll control
  useEffect(() => {
    if (messagesEndRef.current) {
      (messagesEndRef.current as any).scrollToBottom = scrollToBottom;
    }
  }, [scrollToBottom]);

  return {
    messages: chatSession.messages,
    isTyping,
    isConnected,
    error,
    sendMessage,
    clearMessages,
    retryLastMessage,
    exportHistory
  };
}
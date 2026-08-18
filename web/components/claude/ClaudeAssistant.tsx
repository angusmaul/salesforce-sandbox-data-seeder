import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  XMarkIcon,
  PaperAirplaneIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { WizardStep, AIConfigStatus } from '../../shared/types/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeAssistantProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  currentStep: WizardStep;
}

const STEP_HINTS: Partial<Record<WizardStep, string>> = {
  authentication: 'Ask about External Client App setup or OAuth errors',
  discovery: 'Ask about object discovery or schema analysis',
  selection: 'Ask which objects to select for your use case',
  configuration: 'Ask about record counts or storage limits',
  preview: 'Ask about the generation plan or AI settings',
  execution: 'Ask about load progress or errors',
  results: 'Ask about load results or error logs'
};

export default function ClaudeAssistant({
  open,
  onClose,
  sessionId,
  currentStep
}: ClaudeAssistantProps) {
  const [aiConfig, setAiConfig] = useState<AIConfigStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // (Re)check provider config every time the panel opens — the user may have
  // just configured one on the Settings page or in the Preview step.
  useEffect(() => {
    if (!open) return;
    fetch('/api/ai/config')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setAiConfig(result.data);
      })
      .catch(() => setAiConfig(null));
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/assistant/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, currentStep })
      });
      const result = await res.json();
      if (result.success) {
        setMessages([...nextMessages, { role: 'assistant', content: result.data.reply }]);
      } else {
        setError(result.error || 'The assistant could not respond.');
      }
    } catch (err: any) {
      setError(err.message || 'The assistant could not respond.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) return null;

  const configured = aiConfig?.configured;
  const providerLabel = aiConfig?.configured
    ? `${aiConfig.provider}${aiConfig.model ? ` · ${aiConfig.model}` : ''}`
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="absolute right-0 top-0 h-full w-full sm:w-[28rem] bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
            {providerLabel && (
              <p className="text-xs text-gray-500 flex items-center truncate">
                <CpuChipIcon className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                {providerLabel}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-3">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Not configured */}
        {aiConfig && !configured && (
          <div className="p-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 font-medium">No AI provider configured</p>
              <p className="text-sm text-amber-700 mt-1">
                The assistant uses your own AI provider — Anthropic, an OpenAI-compatible
                endpoint, or local Ollama. Configure one to start chatting.
              </p>
              <Link href="/settings" className="inline-flex items-center mt-3 text-sm font-medium text-amber-900 hover:text-amber-700">
                <Cog6ToothIcon className="h-4 w-4 mr-1.5" />
                Open AI Settings
              </Link>
            </div>
          </div>
        )}

        {/* Chat area */}
        {configured && (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 text-sm mt-8">
                  <p className="font-medium text-gray-700 mb-1">How can I help?</p>
                  <p>{STEP_HINTS[currentStep] || 'Ask anything about seeding your sandbox'}.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap bg-blue-600 text-white">
                      {m.content}
                    </div>
                  ) : (
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-900 assistant-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 flex items-center">
                    <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-gray-200 p-3">
              <div className="flex items-end space-x-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Ask the assistant..."
                  className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="btn-primary p-2 disabled:opacity-50"
                  title="Send"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

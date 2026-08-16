import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  CpuChipIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { AIConfigStatus } from '../../shared/types/api';

interface AISettingsPanelProps {
  onConfigChange?: (config: AIConfigStatus) => void;
}

const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
  { value: 'ollama', label: 'Ollama (local models)' }
] as const;

const BASE_URL_PLACEHOLDERS: Record<string, string> = {
  'openai-compatible': 'https://api.openai.com (or LM Studio / Groq / OpenRouter / vLLM URL)',
  ollama: 'http://localhost:11434 (from Docker: http://host.docker.internal:11434)'
};

const MODEL_PLACEHOLDERS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  'openai-compatible': 'gpt-4o-mini',
  ollama: 'llama3.1'
};

export default function AISettingsPanel({ onConfigChange }: AISettingsPanelProps) {
  const [config, setConfig] = useState<AIConfigStatus | null>(null);
  const [provider, setProvider] = useState<string>('anthropic');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/config');
      const result = await res.json();
      if (result.success) {
        setConfig(result.data);
        onConfigChange?.(result.data);
        if (result.data.configured) {
          setProvider(result.data.provider);
          setModel(result.data.model || '');
          setBaseUrl(result.data.baseUrl || '');
        }
      }
    } catch (error) {
      console.error('Failed to load AI config:', error);
    }
  }, [onConfigChange]);

  useEffect(() => {
    loadConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProviderChange = (value: string) => {
    setProvider(value);
    setModel('');
    setBaseUrl('');
    setTestResult(null);
    setOllamaModels([]);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, baseUrl, apiKey })
      });
      const result = await res.json();
      if (result.success) {
        setTestResult(result.data);
        if (Array.isArray(result.data.models)) {
          setOllamaModels(result.data.models);
          if (result.data.models.length > 0 && !model) {
            setModel(result.data.models[0]);
          }
        }
        if (result.data.ok) {
          toast.success('AI provider responded successfully');
        } else {
          toast.error(result.data.error || 'Provider test failed');
        }
      } else {
        setTestResult({ ok: false, error: result.error });
        toast.error(result.error || 'Provider test failed');
      }
    } catch (error: any) {
      setTestResult({ ok: false, error: error.message });
      toast.error('Provider test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, baseUrl, apiKey })
      });
      const result = await res.json();
      if (result.success) {
        toast.success('AI provider saved');
        setApiKey('');
        setConfig(result.data);
        onConfigChange?.(result.data);
      } else {
        toast.error(result.error || 'Failed to save AI settings');
      }
    } catch (error: any) {
      toast.error('Failed to save AI settings');
    } finally {
      setSaving(false);
    }
  };

  const needsBaseUrl = provider === 'openai-compatible' || provider === 'ollama';
  const needsApiKey = provider === 'anthropic' || provider === 'openai-compatible';

  return (
    <div className="border border-gray-200 bg-white rounded-lg p-4">
      <div className="flex items-center mb-3">
        <CpuChipIcon className="h-5 w-5 text-gray-600 mr-2" />
        <h3 className="font-medium text-gray-900">AI Provider</h3>
        {config?.configured && (
          <span className="ml-3 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
            {config.source === 'env' ? 'Using server env key' : `${config.provider} configured`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider */}
        <div>
          <label className="label text-sm">Provider</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="input text-sm"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="label text-sm">Model</label>
          {provider === 'ollama' && ollamaModels.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} className="input text-sm">
              {ollamaModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={MODEL_PLACEHOLDERS[provider]}
              className="input text-sm"
            />
          )}
          {provider === 'ollama' && ollamaModels.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">Click Test to list installed models.</p>
          )}
        </div>

        {/* Base URL */}
        {needsBaseUrl && (
          <div className="md:col-span-2">
            <label className="label text-sm">Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={BASE_URL_PLACEHOLDERS[provider]}
              className="input text-sm"
            />
          </div>
        )}

        {/* API Key */}
        {needsApiKey && (
          <div className="md:col-span-2">
            <label className="label text-sm">
              API Key
              {provider === 'openai-compatible' && <span className="text-gray-400"> (optional for local servers)</span>}
              {config?.apiKeySet && <span className="ml-2 text-xs text-green-600">a key is saved — leave blank to keep it</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.apiKeySet ? '••••••••••••' : 'Paste your API key'}
              className="input text-sm"
              autoComplete="off"
            />
          </div>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`mt-3 flex items-start text-sm ${testResult.ok ? 'text-green-700' : 'text-red-700'}`}>
          {testResult.ok ? (
            <CheckCircleIcon className="h-5 w-5 mr-1.5 flex-shrink-0" />
          ) : (
            <XCircleIcon className="h-5 w-5 mr-1.5 flex-shrink-0" />
          )}
          <span>{testResult.ok ? 'Provider is reachable and responding.' : testResult.error}</span>
        </div>
      )}

      <div className="mt-4 flex space-x-3">
        <button
          onClick={handleTest}
          disabled={testing || saving}
          className="btn-outline text-sm"
        >
          {testing ? (
            <>
              <ArrowPathIcon className="h-4 w-4 mr-1.5 animate-spin inline" />
              Testing...
            </>
          ) : (
            'Test connection'
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={testing || saving}
          className="btn-primary text-sm"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

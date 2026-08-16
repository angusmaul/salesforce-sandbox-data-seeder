import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  EyeIcon,
  PlayIcon,
  ClockIcon,
  CubeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  LinkIcon,
  SparklesIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import {
  WizardSession, WizardStep, AIGenerationPlan,
  CompanyProfile, CategoryOption, AIConfigStatus
} from '../../../shared/types/api';
import AISettingsPanel from '../../ai/AISettingsPanel';
import { Socket } from 'socket.io-client';

interface PreviewStepProps {
  session: WizardSession;
  onNext: (step: WizardStep) => void;
  onPrevious: (step: WizardStep) => void;
  socket?: Socket | null;
}

// Confidence badge colors
const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800'
};

// Company profile labels
const PROFILE_OPTIONS: { value: CompanyProfile; label: string; description: string }[] = [
  { value: 'small', label: 'Small Business', description: 'Revenue <$5M, 1-50 employees' },
  { value: 'medium', label: 'Medium Business', description: 'Revenue $5M-$100M, 50-500 employees' },
  { value: 'enterprise', label: 'Enterprise', description: 'Revenue >$100M, 500+ employees' },
  { value: 'mixed', label: 'Mixed', description: 'Random mix of all sizes' }
];

export default function PreviewStep({
  session,
  onNext,
  onPrevious
}: PreviewStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());

  // AI plan state
  const [aiPlan, setAiPlan] = useState<AIGenerationPlan | null>(session.aiGenerationPlan || null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(session.aiCompanyProfile || 'medium');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [sampleRecords, setSampleRecords] = useState<Record<string, any[]>>({});
  const [loadingSamples, setLoadingSamples] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<{ object: string; field: string } | null>(null);
  const [aiConfig, setAiConfig] = useState<AIConfigStatus | null>(null);
  const [showAISettings, setShowAISettings] = useState(false);

  // Load categories list for override dropdowns
  useEffect(() => {
    fetch(`/api/ai/categories`)
      .then(r => r.json())
      .then(res => { if (res.success) setCategories(res.data); })
      .catch(() => {});
  }, []);

  // Load AI provider availability (drives the banner + settings panel)
  useEffect(() => {
    fetch(`/api/ai/config`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setAiConfig(res.data);
          if (!res.data.configured) setShowAISettings(true);
        }
      })
      .catch(() => {});
  }, []);

  // Load existing AI plan from session on mount
  useEffect(() => {
    if (!aiPlan && session.id) {
      fetch(`/api/ai/generation-plan/${session.id}`)
        .then(r => r.json())
        .then(res => { if (res.success && res.data) setAiPlan(res.data); })
        .catch(() => {});
    }
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate generation summary
  const generationSummary = useMemo(() => {
    if (!session.configuration) return null;

    const enabledConfigs = Object.values(session.configuration).filter((config: any) => config.enabled);
    const totalRecords = enabledConfigs.reduce((sum: number, config: any) => sum + config.recordCount, 0);
    const estimatedTime = Math.ceil(totalRecords / 100);

    return {
      objectCount: enabledConfigs.length,
      totalRecords,
      estimatedTime,
      enabledConfigs
    };
  }, [session.configuration]);

  // Calculate dependency order
  const dependencyOrder = useMemo(() => {
    if (!session.configuration || !session.fieldAnalysis) return [];

    const enabledConfigs = Object.values(session.configuration).filter((config: any) => config.enabled);
    const ordered: any[] = [];
    const remaining = [...enabledConfigs];
    const processed = new Set<string>();

    const addNextBatch = () => {
      const nextBatch: any[] = [];
      for (let i = remaining.length - 1; i >= 0; i--) {
        const config = remaining[i];
        const fieldAnalysis = session.fieldAnalysis![config.name];
        const relevantDeps = fieldAnalysis?.relationships?.map((rel: any) => rel.referenceTo).flat()
          .filter((dep: string) => enabledConfigs.some((c: any) => c.name === dep)) || [];
        const canAdd = relevantDeps.every((dep: string) => processed.has(dep));
        if (canAdd) {
          nextBatch.push({ ...config, fieldAnalysis, dependencies: relevantDeps });
          remaining.splice(i, 1);
          processed.add(config.name);
        }
      }
      return nextBatch;
    };

    let maxIterations = enabledConfigs.length + 5;
    while (remaining.length > 0 && maxIterations > 0) {
      const batch = addNextBatch();
      if (batch.length === 0) {
        remaining.forEach((config: any) => {
          const fieldAnalysis = session.fieldAnalysis![config.name];
          const relevantDeps = fieldAnalysis?.relationships?.map((rel: any) => rel.referenceTo).flat()
            .filter((dep: string) => enabledConfigs.some((c: any) => c.name === dep)) || [];
          batch.push({ ...config, fieldAnalysis, dependencies: relevantDeps });
          processed.add(config.name);
        });
        remaining.length = 0;
      }
      ordered.push(...batch);
      maxIterations--;
    }
    return ordered;
  }, [session.configuration, session.fieldAnalysis]);

  // System fields that cannot be written to
  const systemFields = new Set([
    'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
    'SystemModstamp', 'LastActivityDate', 'LastViewedDate', 'LastReferencedDate',
    'IsDeleted', 'MasterRecordId', 'RecordTypeId', 'OwnerId'
  ]);

  const getWritableFields = (fieldAnalysis: any) => {
    return fieldAnalysis?.fields?.filter((field: any) =>
      !systemFields.has(field.name) &&
      !field.name.endsWith('__pc') &&
      !field.name.startsWith('Formula') &&
      field.type !== 'calculated' &&
      field.type !== 'summary' &&
      field.createable !== false &&
      !field.calculated &&
      !field.calculatedFormula &&
      !field.autoNumber
    ) || [];
  };

  // --- AI Analysis ---

  const handleAnalyzeFields = useCallback(async () => {
    if (!session.id) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/ai/analyze-fields/${session.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAiPlan(data.data);
        toast.success(`AI analyzed ${data.objectCount} objects`);
      } else {
        toast.error(data.error || 'AI analysis failed');
      }
    } catch (err: any) {
      toast.error(`AI analysis error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [session.id]);

  // --- Load sample records for an object ---

  const loadSampleRecords = useCallback(async (objectName: string) => {
    if (!session.id) return;
    setLoadingSamples(prev => new Set(prev).add(objectName));
    try {
      const res = await fetch(`/api/ai/sample-values/${session.id}/${objectName}?count=3`);
      const data = await res.json();
      if (data.success) {
        setSampleRecords(prev => ({ ...prev, [objectName]: data.data }));
      }
    } catch {
      // silent
    } finally {
      setLoadingSamples(prev => {
        const next = new Set(prev);
        next.delete(objectName);
        return next;
      });
    }
  }, [session.id]);

  // --- Override a field's mapping ---

  const handleOverride = useCallback(async (objectName: string, fieldName: string, category: string, subcategory: string) => {
    if (!session.id || !aiPlan) return;
    const overrides = { [objectName]: { [fieldName]: { category, subcategory } } };
    try {
      const res = await fetch(`/api/ai/generation-plan/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides })
      });
      const data = await res.json();
      if (data.success) {
        setAiPlan(data.data);
        setEditingField(null);
        // Refresh samples for this object
        loadSampleRecords(objectName);
      }
    } catch {
      toast.error('Failed to save override');
    }
  }, [session.id, aiPlan, loadSampleRecords]);

  // --- Save company profile ---

  const handleProfileChange = useCallback(async (profile: CompanyProfile) => {
    setCompanyProfile(profile);
    if (!session.id) return;
    try {
      await fetch(`/api/ai/generation-plan/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyProfile: profile })
      });
    } catch {
      // silent
    }
  }, [session.id]);

  const handleStartGeneration = async () => {
    if (!generationSummary || generationSummary.totalRecords === 0) {
      toast.error('No records configured for generation');
      return;
    }

    if (generationSummary.totalRecords > 1000) {
      const proceed = window.confirm(
        `You're about to generate ${generationSummary.totalRecords.toLocaleString()} records across ${generationSummary.objectCount} objects. This will take approximately ${generationSummary.estimatedTime} minutes. Continue?`
      );
      if (!proceed) return;
    }

    try {
      setIsGenerating(true);
      toast.success('Starting data generation...');
      onNext('execution');
    } catch (error) {
      console.error('Generation start error:', error);
      toast.error('Failed to start data generation');
      setIsGenerating(false);
    }
  };

  const toggleObjectExpansion = (objectName: string) => {
    setExpandedObjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(objectName)) {
        newSet.delete(objectName);
      } else {
        newSet.add(objectName);
        // Auto-load sample records when expanding with AI plan
        if (aiPlan?.[objectName] && !sampleRecords[objectName]) {
          loadSampleRecords(objectName);
        }
      }
      return newSet;
    });
  };

  // Group categories for the dropdown
  const groupedCategories = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const { category, subcategory } of categories) {
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(subcategory);
    }
    return grouped;
  }, [categories]);

  if (!generationSummary) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <ExclamationTriangleIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Configuration Found</h3>
          <p className="text-gray-600 mb-6">Please go back and configure your data generation settings.</p>
          <button onClick={() => onPrevious('configuration')} className="btn-primary">Back to Configuration</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <EyeIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">Review Generation Plan</h1>
        </div>
        <p className="text-gray-600">
          Review your data generation configuration before starting. Objects will be processed in dependency order.
        </p>
      </div>

      {/* Generation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center">
            <CubeIcon className="h-6 w-6 text-blue-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-blue-900">{generationSummary.objectCount}</p>
              <p className="text-sm text-blue-600">Objects</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center">
            <ChartBarIcon className="h-6 w-6 text-green-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-green-900">{generationSummary.totalRecords.toLocaleString()}</p>
              <p className="text-sm text-green-600">Total Records</p>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="flex items-center">
            <ClockIcon className="h-6 w-6 text-purple-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-purple-900">~{generationSummary.estimatedTime}min</p>
              <p className="text-sm text-purple-600">Estimated Time</p>
            </div>
          </div>
        </div>
        <div className="bg-amber-50 p-4 rounded-lg">
          <div className="flex items-center">
            <InformationCircleIcon className="h-6 w-6 text-amber-600 mr-2" />
            <div>
              <p className="text-2xl font-bold text-amber-900">{session.connectionInfo?.instanceUrl?.includes('--') ? 'Sandbox' : 'Production'}</p>
              <p className="text-sm text-amber-600">Target Org</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="mb-8 p-4 border border-indigo-200 bg-indigo-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <SparklesIcon className="h-5 w-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-indigo-900">AI-Enhanced Data Generation</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Company Profile Selector */}
            {aiPlan && (
              <select
                value={companyProfile}
                onChange={e => handleProfileChange(e.target.value as CompanyProfile)}
                className="text-sm border border-indigo-300 rounded-md px-2 py-1 bg-white text-indigo-900"
              >
                {PROFILE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowAISettings(s => !s)}
              className="text-sm text-indigo-700 hover:text-indigo-900 font-medium"
            >
              {showAISettings ? 'Hide settings' : 'AI settings'}
            </button>
            <button
              onClick={handleAnalyzeFields}
              disabled={isAnalyzing || !aiConfig?.configured}
              title={!aiConfig?.configured ? 'Configure an AI provider first' : undefined}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-1.5 animate-spin" />
                  Analyzing...
                </>
              ) : aiPlan ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-1.5" />
                  Re-analyze
                </>
              ) : (
                <>
                  <SparklesIcon className="h-4 w-4 mr-1.5" />
                  Analyze Fields with AI
                </>
              )}
            </button>
          </div>
        </div>
        <p className="text-sm text-indigo-700">
          {aiPlan
            ? `AI has classified fields across ${Object.keys(aiPlan).length} objects. Expand objects below to see mappings, override categories, and preview realistic sample data.`
            : aiConfig?.configured
              ? `Use AI to analyze your field schemas and generate more realistic, correlated test data. Field metadata (not your data) is sent to ${aiConfig.provider === 'ollama' ? `your local Ollama model (${aiConfig.model})` : `${aiConfig.provider === 'anthropic' ? 'Anthropic' : 'your configured endpoint'} (${aiConfig.model})`} for classification.`
              : 'No AI provider is configured. Set one up below — Anthropic, any OpenAI-compatible endpoint, or a local Ollama model. Without AI, generation still works using pattern-based rules.'}
        </p>
        {aiPlan && companyProfile && (
          <p className="text-xs text-indigo-500 mt-1">
            Record profile: <strong>{PROFILE_OPTIONS.find(p => p.value === companyProfile)?.label}</strong> — {PROFILE_OPTIONS.find(p => p.value === companyProfile)?.description}
          </p>
        )}
        {showAISettings && (
          <div className="mt-4">
            <AISettingsPanel onConfigChange={setAiConfig} />
          </div>
        )}
      </div>

      {/* Processing Order */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Processing Order</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center mb-4">
            <InformationCircleIcon className="h-5 w-5 text-blue-600 mr-2" />
            <p className="text-sm text-gray-600">
              Objects will be processed in this order to respect data dependencies:
            </p>
          </div>

          <div className="space-y-3">
            {dependencyOrder.map((item: any, index: number) => {
              const isExpanded = expandedObjects.has(item.name);
              const fieldAnalysis = item.fieldAnalysis;
              const writableFields = getWritableFields(fieldAnalysis);
              const requiredFields = fieldAnalysis?.fields?.filter((f: any) => f.required) || [];
              const objectPlan = aiPlan?.[item.name];

              return (
                <div key={item.name} className="border border-gray-200 rounded-lg">
                  <div
                    className="flex items-center p-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleObjectExpansion(item.name)}
                  >
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mr-4">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="font-medium text-gray-900">{item.name}</h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {item.recordCount.toLocaleString()} records
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {writableFields.length} fields
                        </span>
                        {objectPlan && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            <SparklesIcon className="h-3 w-3 mr-0.5" />AI mapped
                          </span>
                        )}
                        {item.dependencies.length > 0 && (
                          <span className="text-xs text-gray-500">
                            Depends on: {item.dependencies.slice(0, 2).join(', ')}
                            {item.dependencies.length > 2 && ` +${item.dependencies.length - 2} more`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{fieldAnalysis?.label}</p>
                    </div>
                    <div className="ml-4">
                      {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && fieldAnalysis && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50">
                      <div className="space-y-6">
                        {/* Field Summary */}
                        <div>
                          <div className="flex items-center mb-3">
                            <InformationCircleIcon className="h-4 w-4 text-green-600 mr-2" />
                            <h4 className="font-medium text-gray-900">Field Summary</h4>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Writable Fields:</div>
                              <div className="font-bold text-blue-600">{writableFields.length}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Required Fields:</div>
                              <div className="font-bold text-red-600">{requiredFields.filter((f: any) => !systemFields.has(f.name)).length}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Custom Fields:</div>
                              <div className="font-bold text-purple-600">{writableFields.filter((f: any) => f.custom).length}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-gray-600">Relationships:</div>
                              <div className="font-bold text-green-600">{item.dependencies.length}</div>
                            </div>
                          </div>
                        </div>

                        {/* AI Field Strategy Table */}
                        {objectPlan && (
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center">
                                <SparklesIcon className="h-4 w-4 text-indigo-600 mr-2" />
                                <h4 className="font-medium text-gray-900">AI Field Mappings</h4>
                              </div>
                              {objectPlan.correlations?.length > 0 && (
                                <span className="text-xs text-indigo-600">
                                  {objectPlan.correlations.length} correlation{objectPlan.correlations.length !== 1 ? 's' : ''} detected
                                </span>
                              )}
                            </div>

                            {/* Correlations */}
                            {objectPlan.correlations?.length > 0 && (
                              <div className="mb-3 flex flex-wrap gap-2">
                                {objectPlan.correlations.map((corr, idx) => (
                                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded text-xs bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    <LinkIcon className="h-3 w-3 mr-1" />
                                    {corr.type}: {corr.fields.join(' + ')}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">AI Category</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sample</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-10"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {writableFields.slice(0, 20).map((field: any) => {
                                      const mapping = objectPlan.fieldMappings[field.name];
                                      const isEditing = editingField?.object === item.name && editingField?.field === field.name;
                                      const sampleValue = sampleRecords[item.name]?.[0]?.[field.name];

                                      return (
                                        <tr key={field.name} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 text-sm">
                                            <div className="font-medium text-gray-900">{field.name}</div>
                                            <div className="text-xs text-gray-500">{field.label}</div>
                                          </td>
                                          <td className="px-3 py-2 text-xs text-gray-600">{field.type}</td>
                                          <td className="px-3 py-2 text-sm">
                                            {isEditing ? (
                                              <select
                                                autoFocus
                                                className="text-xs border border-gray-300 rounded px-1 py-0.5 w-full"
                                                defaultValue={mapping ? `${mapping.category}.${mapping.subcategory}` : ''}
                                                onChange={e => {
                                                  const [cat, sub] = e.target.value.split('.');
                                                  if (cat && sub) handleOverride(item.name, field.name, cat, sub);
                                                }}
                                                onBlur={() => setEditingField(null)}
                                              >
                                                <option value="">-- select --</option>
                                                {Object.entries(groupedCategories).map(([cat, subs]) => (
                                                  <optgroup key={cat} label={cat}>
                                                    {subs.map(sub => (
                                                      <option key={`${cat}.${sub}`} value={`${cat}.${sub}`}>
                                                        {cat}.{sub}
                                                      </option>
                                                    ))}
                                                  </optgroup>
                                                ))}
                                              </select>
                                            ) : mapping ? (
                                              <span className="text-indigo-700">
                                                {mapping.category}.{mapping.subcategory}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400 italic">unmapped</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-xs">
                                            {mapping && (
                                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${CONFIDENCE_COLORS[mapping.confidence] || 'bg-gray-100 text-gray-800'}`}>
                                                {mapping.confidence}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate">
                                            {loadingSamples.has(item.name) ? (
                                              <span className="text-gray-400">loading...</span>
                                            ) : sampleValue !== undefined ? (
                                              <span title={String(sampleValue)}>{String(sampleValue).substring(0, 40)}</span>
                                            ) : null}
                                          </td>
                                          <td className="px-3 py-2">
                                            <button
                                              onClick={e => {
                                                e.stopPropagation();
                                                setEditingField({ object: item.name, field: field.name });
                                              }}
                                              className="text-gray-400 hover:text-indigo-600"
                                              title="Override category"
                                            >
                                              <AdjustmentsHorizontalIcon className="h-4 w-4" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {writableFields.length > 20 && (
                                <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
                                  +{writableFields.length - 20} more fields not shown
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Sample Data Table (when no AI plan, show generic preview) */}
                        {!objectPlan && (
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center">
                                <DocumentTextIcon className="h-4 w-4 text-blue-600 mr-2" />
                                <h4 className="font-medium text-gray-900">Sample Data Preview</h4>
                              </div>
                              <span className="text-sm text-gray-600">Pattern-based generation (no AI)</span>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">#</th>
                                      {writableFields.slice(0, 6).map((field: any) => (
                                        <th key={field.name} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                          <div className="flex items-center gap-1">
                                            <span className="truncate">{field.name}</span>
                                            {field.required && <span className="text-red-500">*</span>}
                                          </div>
                                          <div className="text-xs normal-case text-gray-400 font-normal">{field.type}</div>
                                        </th>
                                      ))}
                                      {writableFields.length > 6 && (
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">+{writableFields.length - 6} more</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {[0, 1, 2].map(idx => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-sm text-gray-900 font-medium">{idx + 1}</td>
                                        {writableFields.slice(0, 6).map((field: any) => {
                                          const val = sampleRecords[item.name]?.[idx]?.[field.name];
                                          return (
                                            <td key={field.name} className="px-3 py-2 text-sm text-gray-700 max-w-[150px]">
                                              <div className="truncate">{val !== undefined ? String(val) : '—'}</div>
                                            </td>
                                          );
                                        })}
                                        {writableFields.length > 6 && <td className="px-3 py-2 text-sm text-gray-400">...</td>}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Required Fields List */}
                        {requiredFields.filter((f: any) => !systemFields.has(f.name)).length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">Required Fields (will be populated):</h5>
                            <div className="flex flex-wrap gap-1">
                              {requiredFields.filter((f: any) => !systemFields.has(f.name)).slice(0, 10).map((field: any, idx: number) => (
                                <span key={idx} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                                  {field.name} ({field.type})
                                </span>
                              ))}
                              {requiredFields.filter((f: any) => !systemFields.has(f.name)).length > 10 && (
                                <span className="text-xs text-gray-500">+{requiredFields.filter((f: any) => !systemFields.has(f.name)).length - 10} more</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Generation Settings Summary */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Generation Settings</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center">
              <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-sm text-gray-700">
                {session.globalSettings?.respectRequiredFields ? 'Will populate required fields' : 'Skip required fields'}
              </span>
            </div>
            <div className="flex items-center">
              <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-sm text-gray-700">
                {aiPlan ? 'AI-enhanced data generation active' : 'Pattern-based data generation'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Important Notice */}
      <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-800 font-medium mb-1">Important:</p>
            <ul className="text-amber-700 space-y-1">
              <li>This will create real data in your Salesforce org</li>
              <li>Generated records cannot be easily bulk deleted</li>
              <li>Consider using a sandbox or developer org for testing</li>
              <li>Large datasets may impact org performance during generation</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button onClick={() => onPrevious('configuration')} className="btn-outline">
          Back to Configuration
        </button>
        <button
          onClick={handleStartGeneration}
          disabled={isGenerating || generationSummary.totalRecords === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Starting Generation...
            </>
          ) : (
            <>
              <PlayIcon className="h-4 w-4 mr-2" />
              Start Generation ({generationSummary.totalRecords.toLocaleString()} records)
            </>
          )}
        </button>
      </div>
    </div>
  );
}

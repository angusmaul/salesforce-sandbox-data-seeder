import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  CubeIcon,
  CheckIcon,
  XMarkIcon,
  SparklesIcon,
  EyeIcon,
  DocumentTextIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import { WizardSession, WizardStep, SalesforceObject } from '../../../shared/types/api';
import { Socket } from 'socket.io-client';

interface SelectionStepProps {
  session: WizardSession;
  onNext: (step: WizardStep) => void;
  onPrevious: (step: WizardStep) => void;
  socket?: Socket | null;
}

// Predefined presets
const PRESETS = [
  {
    id: 'sales-cloud',
    name: 'Sales Cloud',
    description: 'Complete sales pipeline with accounts, contacts, leads, and opportunities',
    objects: ['Account', 'Contact', 'Lead', 'Opportunity', 'Product2', 'Pricebook2', 'PricebookEntry'],
    icon: '💼'
  },
  {
    id: 'service-cloud',
    name: 'Service Cloud',
    description: 'Customer service and support with cases and knowledge articles',
    objects: ['Account', 'Contact', 'Case', 'Solution', 'KnowledgeArticle'],
    icon: '🎧'
  },
  {
    id: 'marketing-cloud',
    name: 'Marketing',
    description: 'Marketing campaigns and member management',
    objects: ['Account', 'Contact', 'Campaign', 'CampaignMember'],
    icon: '📢'
  },
  {
    id: 'custom-only',
    name: 'Custom Objects',
    description: 'All custom objects (ending with __c)',
    objects: [], // Will be populated with custom objects
    icon: '⚙️'
  }
];

export default function SelectionStep({ 
  session, 
  onNext, 
  onPrevious, 
  socket 
}: SelectionStepProps) {
  const [selectedObjects, setSelectedObjects] = useState<string[]>(session.selectedObjects || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [objectCategories, setObjectCategories] = useState<any>({});
  const [analyzingFields, setAnalyzingFields] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0, message: '' });
  const [selectedObjectForDetails, setSelectedObjectForDetails] = useState<string | null>(null);
  const [fieldSearchTerm, setFieldSearchTerm] = useState('');
  
  const objects = session.discoveredObjects || [];
  
  useEffect(() => {
    // Categorize objects
    categorizeObjects();
  }, [objects]);
  
  useEffect(() => {
    // Listen for field analysis progress updates
    if (socket) {
      socket.on('progress', handleProgressUpdate);
      socket.on('step-complete', handleStepComplete);
      
      return () => {
        socket.off('progress', handleProgressUpdate);
        socket.off('step-complete', handleStepComplete);
      };
    }
  }, [socket]);
  
  const handleProgressUpdate = (update: any) => {
    if (update.step === 'field-analysis') {
      // Throttle progress updates to reduce flashing
      setAnalysisProgress(prev => {
        const newProgress = {
          current: update.data?.current || 0,
          total: update.data?.total || 0,
          message: update.message
        };
        
        // Only update if there's a meaningful change
        if (prev.current !== newProgress.current || prev.message !== newProgress.message) {
          return newProgress;
        }
        return prev;
      });
    }
  };
  
  const handleStepComplete = (data: any) => {
    if (data.step === 'field-analysis') {
      setAnalyzingFields(false);
      toast.success(`Field analysis completed! Analyzed ${data.data?.analyzedObjects || selectedObjects.length} objects.`);
      
      // No need to reload - the session data will be updated automatically
      // Field analysis results are available through the session object
      console.log('Field analysis completed successfully');
    }
  };
  
  const categorizeObjects = () => {
    const categories: any = {
      core: [],
      sales: [],
      service: [],
      marketing: [],
      custom: [],
      system: []
    };
    
    const coreObjects = ['Account', 'Contact']; // Essential business objects
    const salesObjects = ['Account', 'Contact', 'Lead', 'Opportunity', 'OpportunityLineItem', 'Product2', 'Pricebook2', 'PricebookEntry', 'Quote'];
    const serviceObjects = ['Account', 'Contact', 'Case', 'CaseComment', 'Solution', 'KnowledgeArticle'];
    const marketingObjects = ['Campaign', 'CampaignMember'];
    const systemObjects = ['User', 'Organization']; // System objects not suitable for seeding
    
    objects.forEach(obj => {
      if (obj.custom) {
        categories.custom.push(obj);
      } else if (systemObjects.includes(obj.name)) {
        categories.system.push(obj);
      } else if (marketingObjects.includes(obj.name)) {
        categories.marketing.push(obj);
      } else if (serviceObjects.includes(obj.name)) {
        // Check if it's service-specific (not Account/Contact)
        if (['Case', 'CaseComment', 'Solution', 'KnowledgeArticle'].includes(obj.name)) {
          categories.service.push(obj);
        } else if (coreObjects.includes(obj.name)) {
          categories.core.push(obj);
        } else {
          categories.service.push(obj);
        }
      } else if (salesObjects.includes(obj.name)) {
        // Check if it's sales-specific (not Account/Contact)  
        if (['Lead', 'Opportunity', 'OpportunityLineItem', 'Product2', 'Pricebook2', 'PricebookEntry', 'Quote'].includes(obj.name)) {
          categories.sales.push(obj);
        } else if (coreObjects.includes(obj.name)) {
          categories.core.push(obj);
        } else {
          categories.sales.push(obj);
        }
      } else if (coreObjects.includes(obj.name)) {
        categories.core.push(obj);
      } else {
        categories.system.push(obj);
      }
    });
    
    setObjectCategories(categories);
  };
  
  const filteredObjects = objects.filter(obj => {
    const matchesSearch = obj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         obj.label.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedCategory === 'all') return matchesSearch;
    
    const categoryObjects = objectCategories[selectedCategory] || [];
    const matchesCategory = categoryObjects.some((catObj: SalesforceObject) => catObj.name === obj.name);
    
    return matchesSearch && matchesCategory;
  });
  
  const handleObjectToggle = (objectName: string) => {
    setSelectedObjects(prev => {
      if (prev.includes(objectName)) {
        return prev.filter(name => name !== objectName);
      } else {
        return [...prev, objectName];
      }
    });
  };
  
  const handlePresetSelect = (preset: any) => {
    let presetObjects = preset.objects;
    
    // Handle custom objects preset
    if (preset.id === 'custom-only') {
      presetObjects = objects
        .filter(obj => obj.custom && obj.createable)
        .map(obj => obj.name);
    }
    
    // Filter to only include objects that exist in the org
    const availableObjects = presetObjects.filter((objName: string) =>
      objects.some(obj => obj.name === objName && obj.createable)
    );
    
    setSelectedObjects(availableObjects);
    toast.success(`Selected ${preset.name} preset (${availableObjects.length} objects)`);
  };
  
  const handleSelectAll = () => {
    const creatableObjects = filteredObjects
      .filter(obj => obj.createable)
      .map(obj => obj.name);
    setSelectedObjects(creatableObjects);
  };
  
  const handleDeselectAll = () => {
    setSelectedObjects([]);
  };
  
  const handleContinue = async () => {
    if (selectedObjects.length === 0) {
      toast.error('Please select at least one object to continue');
      return;
    }
    
    try {
      setAnalyzingFields(true);
      
      // Update session with selected objects
      const sessionResponse = await fetch(`/api/sessions/${session.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedObjects
        }),
      });
      
      const sessionResult = await sessionResponse.json();
      
      if (!sessionResult.success) {
        toast.error(sessionResult.error || 'Failed to save object selection');
        setAnalyzingFields(false);
        return;
      }
      
      // Start targeted field analysis
      const analysisResponse = await fetch(`/api/discovery/analyze-fields/${session.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          objectNames: selectedObjects
        }),
      });
      
      const analysisResult = await analysisResponse.json();
      
      if (!analysisResult.success) {
        toast.error(analysisResult.error || 'Failed to start field analysis');
        setAnalyzingFields(false);
        return;
      }
      
      // Field analysis started - progress will be handled via WebSocket
      toast.success(`Started field analysis for ${selectedObjects.length} objects`);
      
    } catch (error) {
      console.error('Continue error:', error);
      toast.error('Failed to proceed with field analysis');
      setAnalyzingFields(false);
    }
  };
  
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <CubeIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">
            Select Objects
          </h1>
        </div>
        <p className="text-gray-600">
          Choose which Salesforce objects to populate with sample data. 
          Field analysis will be performed on selected objects to determine relationships and load order.
        </p>
      </div>
      
      {/* Field Analysis Progress */}
      {analyzingFields && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center mb-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
            <h3 className="font-medium text-blue-800">Analyzing Selected Objects</h3>
          </div>
          
          <p className="text-blue-700 mb-3">{analysisProgress.message}</p>
          
          {analysisProgress.total > 0 && (
            <div>
              <div className="flex justify-between text-sm text-blue-600 mb-1">
                <span>Field Analysis Progress</span>
                <span>{analysisProgress.current} of {analysisProgress.total}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Presets */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Presets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESETS.map(preset => {
            const availableCount = preset.id === 'custom-only' 
              ? objects.filter(obj => obj.custom && obj.createable).length
              : preset.objects.filter(objName => 
                  objects.some(obj => obj.name === objName && obj.createable)
                ).length;
            
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset)}
                className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                disabled={availableCount === 0}
              >
                <div className="flex items-center mb-2">
                  <span className="text-2xl mr-2">{preset.icon}</span>
                  <h3 className="font-medium text-gray-900">{preset.name}</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">{preset.description}</p>
                <p className="text-xs text-gray-500">
                  {availableCount} object{availableCount !== 1 ? 's' : ''} available
                </p>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Object Selection */}
        <div className="lg:col-span-2">
          {/* Filters and Search */}
          <div className="mb-6 space-y-4">
            {/* Search and Category Filter Row */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search objects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input w-full"
                />
              </div>
              
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input w-full sm:w-48"
              >
                <option value="all">All Categories</option>
                <option value="core">Core Objects</option>
                <option value="sales">Sales Cloud</option>
                <option value="service">Service Cloud</option>
                <option value="marketing">Marketing</option>
                <option value="custom">Custom Objects</option>
                <option value="system">System Objects</option>
              </select>
            </div>
            
            {/* Action Buttons Row */}
            <div className="flex justify-end">
              <button
                onClick={handleSelectAll}
                className="btn-outline text-sm"
              >
                Select All ({filteredObjects.filter(obj => obj.createable).length})
              </button>
            </div>
          </div>
          
          {/* Object List */}
          <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
            {filteredObjects.map(obj => {
              const isSelected = selectedObjects.includes(obj.name);
              const isCreateable = obj.createable;
              
              return (
                <div
                  key={obj.name}
                  className={`flex items-center justify-between p-3 hover:bg-gray-50 ${
                    !isCreateable ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center flex-1">
                    <button
                      onClick={() => isCreateable && handleObjectToggle(obj.name)}
                      disabled={!isCreateable}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center mr-3 ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 hover:border-blue-400'
                      } ${!isCreateable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
                    </button>
                    
                    <div className="flex-1">
                      <div className="flex items-center">
                        <h3 className="font-medium text-gray-900 mr-2">{obj.name}</h3>
                        {obj.custom && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{obj.label}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                        <span>
                          {obj.fieldCount ? `${obj.fieldCount} fields` : 'Fields will be analyzed after selection'}
                        </span>
                        {!isCreateable && <span className="text-red-500">Not createable</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {filteredObjects.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No objects found matching your criteria.
              </div>
            )}
          </div>
        </div>
        
        {/* Right column: Selected Objects */}
        <div className="lg:col-span-1">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 sticky top-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-blue-900">Selected Objects</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-700">{selectedObjects.length}</span>
                {selectedObjects.length > 0 && (
                  <button
                    onClick={handleDeselectAll}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
            
            {selectedObjects.length === 0 ? (
              <div className="text-center py-8 text-blue-600">
                <CubeIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No objects selected</p>
                <p className="text-xs opacity-75 mt-1">Choose objects from the left to begin</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {selectedObjects.map(objName => {
                  const obj = objects.find(o => o.name === objName);
                  if (!obj) return null;
                  
                  return (
                    <div
                      key={objName}
                      className="flex items-center justify-between p-2 bg-white rounded border border-blue-200 hover:border-blue-300"
                    >
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h4 className="font-medium text-gray-900 text-sm mr-2">{obj.name}</h4>
                          {obj.custom && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600">{obj.label}</p>
                        {session.fieldAnalysis && session.fieldAnalysis[objName] && (
                          <p className="text-xs text-green-600 mt-1">
                            ✓ {session.fieldAnalysis[objName].fieldCount} fields analyzed
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleObjectToggle(objName)}
                        className="ml-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Field Analysis Results */}
      {session.fieldAnalysis && Object.keys(session.fieldAnalysis).length > 0 && (
        <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center mb-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-100">
                <CheckIcon className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-green-800">Field Analysis Complete</h3>
              <p className="text-sm text-green-600">
                Analyzed {Object.keys(session.fieldAnalysis).length} objects with detailed field information
              </p>
            </div>
            
            {/* Re-analyze Button */}
            <button
              onClick={handleContinue}
              disabled={analyzingFields}
              className="btn-outline text-sm whitespace-nowrap"
            >
              {analyzingFields ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Re-analyzing...
                </>
              ) : (
                'Re-analyze Fields'
              )}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(session.fieldAnalysis).map(([objectName, objectData]: [string, any]) => (
              <div 
                key={objectName} 
                className="bg-white border border-green-200 rounded-lg p-4 cursor-pointer hover:border-green-300 hover:bg-green-25 transition-colors"
                onClick={() => setSelectedObjectForDetails(objectName)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{objectName}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{objectData.fieldCount} fields</span>
                    <EyeIcon className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{objectData.label}</p>
                
                {objectData.relationships && objectData.relationships.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1">
                      Dependencies ({objectData.relationships.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {objectData.relationships.slice(0, 3).map((rel: any, idx: number) => (
                        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {rel.referenceTo[0]}
                        </span>
                      ))}
                      {objectData.relationships.length > 3 && (
                        <span className="text-xs text-gray-500">+{objectData.relationships.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="mt-3 flex items-center text-xs text-green-600">
                  <EyeIcon className="h-3 w-3 mr-1" />
                  Click to view details
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={() => onPrevious('discovery')}
          className="btn-outline"
        >
          Back to Discovery
        </button>
        
        {/* Only show analyze button if field analysis hasn't been completed */}
        {!session.fieldAnalysis && (
          <button
            onClick={handleContinue}
            disabled={selectedObjects.length === 0 || analyzingFields}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzingFields ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Analyzing Fields...
              </>
            ) : (
              `Analyze Fields & Continue (${selectedObjects.length} selected)`
            )}
          </button>
        )}
        
        {/* Show continue button if field analysis is complete */}
        {session.fieldAnalysis && Object.keys(session.fieldAnalysis).length > 0 && (
          <button
            onClick={() => onNext('configuration')}
            className="btn-primary"
          >
            Continue to Configuration →
          </button>
        )}
      </div>
      
      {/* Object Details Modal */}
      {selectedObjectForDetails && session.fieldAnalysis && session.fieldAnalysis[selectedObjectForDetails] && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center">
                <CubeIcon className="h-6 w-6 text-blue-600 mr-3" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedObjectForDetails}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {session.fieldAnalysis[selectedObjectForDetails].label}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedObjectForDetails(null);
                  setFieldSearchTerm('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex flex-col h-full">
              {/* Search Bar */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <DocumentTextIcon className="h-5 w-5 text-blue-600 mr-2" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Fields ({session.fieldAnalysis[selectedObjectForDetails].fields?.filter((field: any) => 
                        field.name.toLowerCase().includes(fieldSearchTerm.toLowerCase()) ||
                        field.label.toLowerCase().includes(fieldSearchTerm.toLowerCase()) ||
                        field.type.toLowerCase().includes(fieldSearchTerm.toLowerCase())
                      ).length || 0} / {session.fieldAnalysis[selectedObjectForDetails].fieldCount})
                    </h3>
                  </div>
                  
                  {/* Field Search */}
                  <div className="w-64">
                    <input
                      type="text"
                      placeholder="Search fields..."
                      value={fieldSearchTerm}
                      onChange={(e) => setFieldSearchTerm(e.target.value)}
                      className="input text-sm w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Fields List - Uses full remaining height */}
              <div className="flex-1 overflow-hidden">
                <div className="h-full p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                    {/* Fields Section - Takes 2/3 of the width but full height */}
                    <div className="lg:col-span-2 overflow-y-auto border border-gray-200 rounded-lg p-4" style={{maxHeight: 'calc(90vh - 200px)'}}>
                      <div className="space-y-3">
                        {session.fieldAnalysis[selectedObjectForDetails].fields
                          ?.filter((field: any) => 
                            field.name.toLowerCase().includes(fieldSearchTerm.toLowerCase()) ||
                            field.label.toLowerCase().includes(fieldSearchTerm.toLowerCase()) ||
                            field.type.toLowerCase().includes(fieldSearchTerm.toLowerCase())
                          )
                          .map((field: any, idx: number) => (
                            <div key={idx} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="font-medium text-gray-900">{field.name}</h4>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                                    {field.type}
                                  </span>
                                  {field.required && (
                                    <span className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded">
                                      Required
                                    </span>
                                  )}
                                  {field.custom && (
                                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-600 rounded">
                                      Custom
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{field.label}</p>
                              {field.length && (
                                <p className="text-xs text-gray-500">Max length: {field.length}</p>
                              )}
                              {field.referenceTo && field.referenceTo.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-blue-700">References:</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {field.referenceTo.map((ref: string, refIdx: number) => (
                                      <span key={refIdx} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                        {ref}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        
                        {/* No results message */}
                        {fieldSearchTerm && session.fieldAnalysis[selectedObjectForDetails].fields?.filter((field: any) => 
                          field.name.toLowerCase().includes(fieldSearchTerm.toLowerCase()) ||
                          field.label.toLowerCase().includes(fieldSearchTerm.toLowerCase()) ||
                          field.type.toLowerCase().includes(fieldSearchTerm.toLowerCase())
                        ).length === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            <DocumentTextIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No fields found matching "{fieldSearchTerm}"</p>
                            <button 
                              onClick={() => setFieldSearchTerm('')}
                              className="text-xs text-blue-600 hover:text-blue-800 underline mt-1"
                            >
                              Clear search
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Relationships Section - Takes 1/3 of the width but full height */}
                    <div className="lg:col-span-1 overflow-y-auto border border-gray-200 rounded-lg p-4" style={{maxHeight: 'calc(90vh - 200px)'}}>
                      <div className="flex items-center mb-4">
                        <LinkIcon className="h-5 w-5 text-green-600 mr-2" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Relationships ({session.fieldAnalysis[selectedObjectForDetails].relationships?.length || 0})
                        </h3>
                      </div>
                      
                      {session.fieldAnalysis[selectedObjectForDetails].relationships?.length > 0 ? (
                        <div className="space-y-3">
                          {session.fieldAnalysis[selectedObjectForDetails].relationships.map((rel: any, idx: number) => (
                            <div key={idx} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-medium text-gray-900 text-sm">{rel.field}</h4>
                                <span className="text-xs px-2 py-1 bg-green-100 text-green-600 rounded">
                                  Reference
                                </span>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm text-gray-600">
                                  <span className="font-medium">References:</span> {rel.referenceTo.join(', ')}
                                </p>
                                {rel.relationshipName && (
                                  <p className="text-sm text-gray-600">
                                    <span className="font-medium">Relationship:</span> {rel.relationshipName}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <LinkIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No relationships found</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setSelectedObjectForDetails(null);
                  setFieldSearchTerm('');
                }}
                className="btn-outline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
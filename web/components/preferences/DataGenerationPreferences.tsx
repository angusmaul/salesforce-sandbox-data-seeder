import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  GlobeAltIcon,
  MapPinIcon,
  CheckIcon,
  InformationCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { DataGenerationPreferences as PrefsType, CountryMetadata, StateCountryMapping } from '../../shared/types/api';

interface DataGenerationPreferencesProps {
  sessionId: string;
  preferences: PrefsType | null;
  onPreferencesChange: (preferences: PrefsType) => void;
}

interface CountryOption {
  code: string;
  name: string;
  default: boolean;
  selected: boolean;
  stateCount: number;
}

export default function DataGenerationPreferences({
  sessionId,
  preferences,
  onPreferencesChange
}: DataGenerationPreferencesProps) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [stateMapping, setStateMapping] = useState<StateCountryMapping>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [useOrgPicklists, setUseOrgPicklists] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // Load preferences first, then country metadata
  useEffect(() => {
    loadPreferences();
  }, [sessionId]);
  
  // Load country metadata only after preferences are loaded
  useEffect(() => {
    if (preferencesLoaded) {
      loadCountryMetadata();
    }
  }, [preferencesLoaded]);

  // Update local state when preferences prop changes
  useEffect(() => {
    if (preferences) {
      setSelectedCountries(prev => {
        const newCountries = preferences.selectedCountries || [];
        // Only update if different to prevent unnecessary re-renders
        if (JSON.stringify(prev.sort()) !== JSON.stringify(newCountries.sort())) {
          return newCountries;
        }
        return prev;
      });
      setUseOrgPicklists(prev => {
        const newValue = preferences.useOrgPicklists !== false;
        return prev !== newValue ? newValue : prev;
      });
    }
  }, [preferences]);

  const loadCountryMetadata = async () => {
    try {
      const response = await fetch(`/api/metadata/countries/${sessionId}`);
      const result = await response.json();
      
      if (result.success) {
        const { countries: countryData, stateCountryMapping, recommendedCountries } = result.data;
        
        // Transform countries into selectable options
        const countryOptions: CountryOption[] = countryData.map((country: any) => {
          // Determine if this country should be selected based on current state or defaults
          const shouldBeSelected = selectedCountries.length > 0
            ? selectedCountries.includes(country.code)
            : recommendedCountries.includes(country.code);
            
          return {
            code: country.code,
            name: country.name,
            default: country.default || false,
            selected: shouldBeSelected,
            stateCount: stateCountryMapping[country.code]?.length || 0
          };
        });

        // Sort countries: recommended first, then alphabetically
        countryOptions.sort((a, b) => {
          if (recommendedCountries.includes(a.code) && !recommendedCountries.includes(b.code)) return -1;
          if (!recommendedCountries.includes(a.code) && recommendedCountries.includes(b.code)) return 1;
          return a.name.localeCompare(b.name);
        });

        setCountries(countryOptions);
        setStateMapping(stateCountryMapping);
        
        // Only set default selection if no countries are currently selected
        if (selectedCountries.length === 0) {
          setSelectedCountries(recommendedCountries);
        }
        
        setLoading(false);
      } else {
        toast.error(`Failed to load country metadata: ${result.error}`);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading country metadata:', error);
      toast.error('Failed to load country metadata');
      setLoading(false);
    }
  };

  const loadPreferences = async () => {
    try {
      const response = await fetch(`/api/preferences/data-generation/${sessionId}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        const prefs = result.data;
        setSelectedCountries(prefs.selectedCountries || []);
        setUseOrgPicklists(prefs.useOrgPicklists !== false);
      }
      // If no saved preferences, selectedCountries remains empty and defaults will be set
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      // Always mark preferences as loaded, whether we found them or not
      setPreferencesLoaded(true);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    
    const preferences: PrefsType = {
      selectedCountries,
      useOrgPicklists,
      customStateMapping: selectedCountries.reduce((mapping, countryCode) => {
        if (stateMapping[countryCode]) {
          mapping[countryCode] = stateMapping[countryCode];
        }
        return mapping;
      }, {} as StateCountryMapping),
      savedAt: new Date()
    };

    try {
      const response = await fetch(`/api/preferences/data-generation/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferences)
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success('Data generation preferences saved!');
        onPreferencesChange(preferences);
      } else {
        toast.error(`Failed to save preferences: ${result.error}`);
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleCountryToggle = (countryCode: string) => {
    setSelectedCountries(prev => {
      if (prev.includes(countryCode)) {
        return prev.filter(code => code !== countryCode);
      } else {
        return [...prev, countryCode];
      }
    });
  };

  const selectRecommended = () => {
    const recommendedCountries = countries
      .filter(country => country.default || ['AU', 'US', 'CA', 'GB'].includes(country.code))
      .map(country => country.code);
    
    setSelectedCountries(recommendedCountries);
  };

  const selectAll = () => {
    // If searching, select all filtered countries; otherwise select all countries
    const countriesToSelect = searchTerm ? filteredCountries : countries;
    const newSelection = [...new Set([...selectedCountries, ...countriesToSelect.map(country => country.code)])];
    setSelectedCountries(newSelection);
  };

  const clearAll = () => {
    setSelectedCountries([]);
  };

  const getPreviewStats = () => {
    const totalStates = selectedCountries.reduce((total, countryCode) => {
      return total + (stateMapping[countryCode]?.length || 0);
    }, 0);

    return {
      countries: selectedCountries.length,
      states: totalStates,
      countriesWithStates: selectedCountries.filter(code => 
        stateMapping[code] && stateMapping[code].length > 0
      ).length
    };
  };

  const filteredCountries = countries.filter(country => 
    country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading country data from your Salesforce org...</span>
        </div>
      </div>
    );
  }

  const stats = getPreviewStats();

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <SparklesIcon className="h-6 w-6 text-blue-600 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Data Generation Preferences</h3>
        </div>
        <div className="text-sm text-gray-500">
          {countries.length} countries available in your org
        </div>
      </div>

      <div className="space-y-6">
        {/* Use Org Picklists Toggle */}
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="use-org-picklists"
              type="checkbox"
              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
              checked={useOrgPicklists}
              onChange={(e) => setUseOrgPicklists(e.target.checked)}
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="use-org-picklists" className="font-medium text-gray-700">
              Use organization-specific country/state data
            </label>
            <p className="text-gray-500">
              Generate data using your org's exact picklist values and state-country relationships. 
              Unchecking will use generic Western countries data.
            </p>
          </div>
        </div>

        {/* Country Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <GlobeAltIcon className="h-5 w-5 text-gray-400 mr-2" />
              <h4 className="text-sm font-medium text-gray-700">Select Countries for Data Generation</h4>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={selectRecommended}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Recommended
              </button>
              <button
                onClick={selectAll}
                className="text-xs text-gray-600 hover:text-gray-800 font-medium"
              >
                {searchTerm ? `Select Filtered (${filteredCountries.length})` : 'Select All'}
              </button>
              <button
                onClick={clearAll}
                className="text-xs text-gray-600 hover:text-gray-800 font-medium"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search countries by name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchTerm && (
              <p className="mt-1 text-xs text-gray-500">
                Showing {filteredCountries.length} of {countries.length} countries
              </p>
            )}
          </div>

          {/* Selected Countries Summary */}
          {selectedCountries.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-blue-800">
                    {selectedCountries.length} countries selected
                  </span>
                </div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {showPreview ? 'Hide' : 'Show'} Preview
                </button>
              </div>
              
              {showPreview && (
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm text-blue-700">
                  <div>
                    <strong>Countries:</strong> {stats.countries}
                  </div>
                  <div>
                    <strong>Total States:</strong> {stats.states}
                  </div>
                  <div className="col-span-2">
                    <strong>Selected:</strong> {selectedCountries
                      .map(code => countries.find(c => c.code === code)?.name || code)
                      .join(', ')
                    }
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Country Grid */}
          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
            {filteredCountries.length === 0 && searchTerm ? (
              <div className="p-8 text-center text-gray-500">
                <GlobeAltIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm">No countries found matching "{searchTerm}"</p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y divide-gray-200 sm:divide-y-0 sm:divide-x">
                {filteredCountries.map((country) => (
                <div key={country.code} className="relative">
                  <div className="p-3 hover:bg-gray-50">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                        checked={selectedCountries.includes(country.code)}
                        onChange={() => handleCountryToggle(country.code)}
                      />
                      <div className="ml-3 flex-1 min-w-0">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-700">
                            {country.code}
                          </span>
                          {country.default && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{country.name}</p>
                        {country.stateCount > 0 && (
                          <p className="text-xs text-gray-400">
                            <MapPinIcon className="h-3 w-3 inline mr-1" />
                            {country.stateCount} states
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <InformationCircleIcon className="h-5 w-5 text-blue-400 mt-0.5 mr-3" />
            <div className="text-sm">
              <h4 className="font-medium text-blue-800 mb-1">How this works:</h4>
              <ul className="text-blue-700 space-y-1">
                <li>• Selected countries will be used to generate realistic address data</li>
                <li>• States are automatically mapped based on your org's picklist relationships</li>
                <li>• Only valid country/state combinations will be generated</li>
                <li>• This eliminates "invalid state code" validation errors</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={savePreferences}
            disabled={saving || selectedCountries.length === 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Saving...
              </>
            ) : (
              <>
                <CheckIcon className="h-4 w-4 mr-2" />
                Save Preferences
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
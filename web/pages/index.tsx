import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  CloudArrowUpIcon,
  CogIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  LightBulbIcon,
  RocketLaunchIcon,
  ClockIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

interface RecentSession {
  id: string;
  currentStep: string;
  updatedAt: string;
  orgName: string | null;
  connectionLabel: string | null;
  hasConnection: boolean;
  objectCount?: number;
}

const STEP_LABELS: { [step: string]: string } = {
  authentication: 'Connect',
  discovery: 'Discovery',
  selection: 'Selection',
  configuration: 'Configuration',
  preview: 'Preview',
  execution: 'Execution',
  results: 'Results'
};

export default function HomePage() {
  const router = useRouter();
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  useEffect(() => {
    // Offer recent sessions (last 24h) for explicit resume
    fetch('/api/sessions/list')
      .then((res) => res.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data)) {
          setRecentSessions(result.data.slice(0, 5));
        }
      })
      .catch((error) => console.error('Failed to load recent sessions:', error));
  }, []);

  const handleStartWizard = async () => {
    try {
      // Always start fresh — saved connections make reconnecting one click,
      // and previous runs are offered explicitly in the resume list below.
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (result.success) {
        router.push(`/wizard?session=${result.data.sessionId}`);
      } else {
        console.error('Failed to create session:', result.error);
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const handleResumeSession = (sessionId: string) => {
    router.push(`/wizard?session=${sessionId}`);
  };

  const features = [
    {
      icon: CloudArrowUpIcon,
      title: 'Smart Data Generation',
      description: 'Generate realistic business data with proper relationships and contextual field values'
    },
    {
      icon: ShieldCheckIcon,
      title: 'Storage-Aware Loading',
      description: 'Automatically calculates safe record counts based on your sandbox storage limits'
    },
    {
      icon: CogIcon,
      title: 'Dependency Management',
      description: 'Handles object relationships and loads data in the correct dependency order'
    },
    {
      icon: ChartBarIcon,
      title: 'Real-time Monitoring',
      description: 'Track progress, view logs, and monitor performance during data loading'
    },
    {
      icon: LightBulbIcon,
      title: 'AI Assistant',
      description: 'Get help from Claude AI for troubleshooting errors and best practices'
    },
    {
      icon: RocketLaunchIcon,
      title: 'Production-Ready',
      description: 'Sandbox-only enforcement and comprehensive error handling for safe operation'
    }
  ];

  return (
    <>
      <Head>
        <title>Salesforce Sandbox Data Seeder</title>
        <meta name="description" content="Generate realistic sample data for your Salesforce sandbox environments" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        {/* Header */}
        <header className="relative bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <img 
                    src="/logo.png" 
                    alt="Salesforce Data Seeder"
                    className="h-10 w-10 rounded-lg"
                  />
                </div>
                <div className="ml-3">
                  <h1 className="text-xl font-bold text-gray-900">
                    Salesforce Data Seeder
                  </h1>
                  <p className="text-sm text-gray-500">Sandbox Data Generation Wizard</p>
                </div>
              </div>
              
              <nav className="hidden md:flex space-x-8">
                <Link href="/docs" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Documentation
                </Link>
                <Link href="/monitoring" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Monitoring
                </Link>
              </nav>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
              Generate Realistic Data for Your{' '}
              <span className="text-gradient">Salesforce Sandbox</span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Streamline your development and testing with intelligent data generation. 
              Our wizard-driven approach makes it easy to populate your sandbox with 
              meaningful, relationship-aware sample data.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={handleStartWizard}
                className="btn-primary text-lg px-8 py-3 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              >
                Start Data Generation Wizard
              </button>
              
              <Link
                href="/docs"
                className="btn-outline text-lg px-8 py-3 hover:shadow-md transition-all duration-200"
              >
                View Documentation
              </Link>
            </div>
          </div>

          {/* Resume Previous Session */}
          {recentSessions.length > 0 && (
            <div className="mt-12 max-w-2xl mx-auto">
              <div className="card">
                <div className="flex items-center mb-4">
                  <ClockIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <h3 className="font-semibold text-gray-900">Resume a previous session</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {recentSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleResumeSession(s.id)}
                      className="w-full flex items-center justify-between py-3 px-2 hover:bg-gray-50 rounded transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center">
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full mr-2">
                            {STEP_LABELS[s.currentStep] || s.currentStep}
                          </span>
                          <span className="font-medium text-gray-900 truncate">
                            {s.connectionLabel || s.orgName || 'Not connected yet'}
                          </span>
                          {s.hasConnection && (
                            <span className="ml-2 h-2 w-2 bg-green-500 rounded-full flex-shrink-0" title="Connection active"></span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Last activity {new Date(s.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0 ml-3" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Features Grid */}
          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
              Powerful Features for Modern Development
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className="card hover:shadow-lg transition-shadow duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-center mb-4">
                    <div className="flex-shrink-0">
                      <feature.icon className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="ml-3 text-lg font-semibold text-gray-900">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* How It Works */}
          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
              How It Works
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {[
                {
                  step: '1',
                  title: 'Connect',
                  description: 'Authenticate to your Salesforce sandbox using secure OAuth 2.0'
                },
                {
                  step: '2', 
                  title: 'Discover',
                  description: 'Automatically discover your objects, fields, and relationships'
                },
                {
                  step: '3',
                  title: 'Configure', 
                  description: 'Select objects and configure record counts with smart recommendations'
                },
                {
                  step: '4',
                  title: 'Generate',
                  description: 'Watch as realistic data is generated and loaded into your sandbox'
                }
              ].map((step, index) => (
                <div key={index} className="text-center">
                  <div className="mx-auto w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-4">
                    {step.step}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-gray-600">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="mt-20 text-center">
            <div className="card max-w-2xl mx-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <h2 className="text-2xl font-bold mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-blue-100 mb-6">
                Join developers who are streamlining their Salesforce development 
                with intelligent data generation.
              </p>
              <button
                onClick={handleStartWizard}
                className="bg-white text-blue-600 hover:bg-gray-50 font-semibold px-6 py-3 rounded-md transition-colors duration-200"
              >
                Launch the Wizard
              </button>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-gray-50 border-t border-gray-200 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center text-gray-500">
              <p>
                &copy; 2024 Salesforce Sandbox Data Seeder. 
                Built with Next.js, Express, and Claude AI.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
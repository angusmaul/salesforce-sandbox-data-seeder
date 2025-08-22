import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { 
  ArrowLeftIcon,
  DocumentTextIcon,
  CodeBracketIcon,
  CogIcon,
  PlayIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline';

export default function DocsPage() {
  const sections = [
    {
      icon: PlayIcon,
      title: 'Quick Start',
      description: 'Get up and running in minutes',
      content: [
        '1. Create an External Client App in Salesforce with Client Credentials Flow',
        '2. Note your Client ID and Client Secret',
        '3. Click "Start Data Generation Wizard" on the homepage',
        '4. Enter your OAuth credentials when prompted',
        '5. Follow the guided wizard steps'
      ]
    },
    {
      icon: CogIcon,
      title: 'Salesforce Setup',
      description: 'Configure your External Client App',
      content: [
        '• Go to Setup → Apps → App Manager → New Connected App',
        '• Enable OAuth Settings with Client Credentials Flow',
        '• Select these scopes: API, Refresh Token',
        '• No callback URL needed for Client Credentials Flow',
        '• Save and note the Consumer Key and Consumer Secret'
      ]
    },
    {
      icon: DocumentTextIcon,
      title: 'Wizard Steps',
      description: 'Understanding the data generation process',
      content: [
        '• Authentication: Secure OAuth connection to your sandbox',
        '• Discovery: Automatic schema analysis and object filtering',
        '• Selection: Choose objects with intelligent recommendations',
        '• Configuration: Set record counts with storage validation',
        '• Preview: Review your configuration before execution',
        '• Execution: Real-time data generation and loading',
        '• Results: Comprehensive analytics and log downloads'
      ]
    },
    {
      icon: CodeBracketIcon,
      title: 'Technical Details',
      description: 'Architecture and implementation',
      content: [
        '• Frontend: Next.js with TypeScript and Tailwind CSS',
        '• Backend: Express.js with Socket.IO for real-time updates',
        '• Authentication: Client Credentials Flow (no user login required)',
        '• Data Generation: Faker.js for business-realistic data',
        '• Storage: File-based session persistence with auto-cleanup',
        '• Logging: Comprehensive audit trails matching CLI format'
      ]
    }
  ];

  const troubleshooting = [
    {
      problem: 'OAuth Authentication Fails',
      solution: 'Verify your External Client App has Client Credentials Flow enabled and correct Consumer Key/Secret'
    },
    {
      problem: 'Discovery Times Out',
      solution: 'Large orgs may take longer. Wait for completion or check network connectivity'
    },
    {
      problem: 'Storage Validation Errors',
      solution: 'Reduce record counts or clear existing data. The tool calculates safe limits automatically'
    },
    {
      problem: 'Data Loading Fails',
      solution: 'Check the detailed logs in Results page. Most issues are field validation or required field problems'
    }
  ];

  return (
    <>
      <Head>
        <title>Documentation - Salesforce Sandbox Data Seeder</title>
        <meta name="description" content="Complete documentation and setup guide for the Salesforce Sandbox Data Seeder" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <Link 
                  href="/"
                  className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <ArrowLeftIcon className="h-5 w-5 mr-2" />
                  Back to Home
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Documentation</h1>
              <div className="w-24" /> {/* Spacer for center alignment */}
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Overview */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Salesforce Sandbox Data Seeder
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              A modern, browser-based wizard for generating realistic sample data in Salesforce 
              sandbox environments. Features intelligent object discovery, business-realistic data 
              generation, and comprehensive results analytics.
            </p>
            <div className="flex gap-4">
              <Link 
                href="/wizard" 
                className="btn-primary"
              >
                Start Wizard
              </Link>
              <Link 
                href="/monitoring" 
                className="btn-outline"
              >
                System Status
              </Link>
            </div>
          </div>

          {/* Main Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {sections.map((section, index) => (
              <div key={index} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center mb-4">
                  <section.icon className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {section.title}
                    </h3>
                    <p className="text-gray-600 text-sm">{section.description}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {section.content.map((item, idx) => (
                    <li key={idx} className="text-gray-700 text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Troubleshooting */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center mb-6">
              <QuestionMarkCircleIcon className="h-8 w-8 text-amber-600 mr-3" />
              <h2 className="text-2xl font-bold text-gray-900">Troubleshooting</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {troubleshooting.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">{item.problem}</h4>
                  <p className="text-gray-600 text-sm">{item.solution}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Resources */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">Additional Resources</h3>
            <div className="space-y-2">
              <p className="text-blue-800">
                • <strong>README.md:</strong> Complete technical documentation in the project repository
              </p>
              <p className="text-blue-800">
                • <strong>CLAUDE.md:</strong> Detailed development log and implementation notes
              </p>
              <p className="text-blue-800">
                • <strong>Built-in AI Assistant:</strong> Use the Claude AI helper in the wizard for real-time assistance
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
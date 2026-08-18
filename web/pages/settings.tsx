import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeftIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import AISettingsPanel from '../components/ai/AISettingsPanel';

export default function SettingsPage() {
  return (
    <>
      <Head>
        <title>Settings - Salesforce Sandbox Data Seeder</title>
        <meta name="description" content="Configure the AI provider used for data generation and the built-in assistant" />
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
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <div className="w-24" /> {/* Spacer for center alignment */}
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* AI Provider */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center mb-2">
              <CpuChipIcon className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">AI Provider</h2>
                <p className="text-gray-600 text-sm">
                  Powers semantic field classification during data generation and the
                  built-in AI assistant.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Bring your own provider: Anthropic (Claude), any OpenAI-compatible endpoint
              (OpenAI, Groq, OpenRouter, LM Studio, vLLM), or local Ollama. Configuring it
              here makes it available before you start the wizard — you can also adjust it
              later from the Preview step. Without a provider, data generation still works
              using the built-in pattern-based generators.
            </p>
            <AISettingsPanel />
          </div>
        </div>
      </div>
    </>
  );
}

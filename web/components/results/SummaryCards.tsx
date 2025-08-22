import React from 'react';
import { CheckCircle, XCircle, Clock, Database, TrendingUp, AlertTriangle } from 'lucide-react';

interface SummaryCardsProps {
  summary: {
    successRate: number;
    totalRecordsAttempted: number;
    totalRecordsCreated: number;
    totalTimeTaken: number;
    averageTimePerObject: number;
    objectsWithErrors: string[];
  };
  sessionInfo: {
    startTime: string;
    endTime: string;
    duration: string;
  };
  totalObjects: number;
}

export default function SummaryCards({ summary, sessionInfo, totalObjects }: SummaryCardsProps) {
  const successRate = summary.successRate || 0;
  const failedRecords = summary.totalRecordsAttempted - summary.totalRecordsCreated;
  const processingTimeSeconds = Math.round(summary.totalTimeTaken / 1000);
  const recordsPerSecond = Math.round(summary.totalRecordsCreated / processingTimeSeconds);

  const cards = [
    {
      title: 'Overall Success Rate',
      value: `${successRate}%`,
      subtitle: `${summary.totalRecordsCreated} of ${summary.totalRecordsAttempted} records`,
      icon: successRate >= 90 ? CheckCircle : successRate >= 70 ? TrendingUp : AlertTriangle,
      color: successRate >= 90 ? 'text-green-600' : successRate >= 70 ? 'text-blue-600' : 'text-amber-600',
      bgColor: successRate >= 90 ? 'bg-green-50' : successRate >= 70 ? 'bg-blue-50' : 'bg-amber-50',
      borderColor: successRate >= 90 ? 'border-green-200' : successRate >= 70 ? 'border-blue-200' : 'border-amber-200'
    },
    {
      title: 'Objects Processed',
      value: totalObjects.toString(),
      subtitle: summary.objectsWithErrors.length > 0 
        ? `${summary.objectsWithErrors.length} with errors` 
        : 'All successful',
      icon: Database,
      color: summary.objectsWithErrors.length === 0 ? 'text-green-600' : 'text-amber-600',
      bgColor: summary.objectsWithErrors.length === 0 ? 'bg-green-50' : 'bg-amber-50',
      borderColor: summary.objectsWithErrors.length === 0 ? 'border-green-200' : 'border-amber-200'
    },
    {
      title: 'Processing Time',
      value: processingTimeSeconds > 60 
        ? `${Math.floor(processingTimeSeconds / 60)}m ${processingTimeSeconds % 60}s`
        : `${processingTimeSeconds}s`,
      subtitle: `${recordsPerSecond} records/sec`,
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      title: 'Failed Records',
      value: failedRecords.toString(),
      subtitle: failedRecords === 0 ? 'Perfect run!' : `${Math.round((failedRecords / summary.totalRecordsAttempted) * 100)}% failure rate`,
      icon: failedRecords === 0 ? CheckCircle : XCircle,
      color: failedRecords === 0 ? 'text-green-600' : 'text-red-600',
      bgColor: failedRecords === 0 ? 'bg-green-50' : 'bg-red-50',
      borderColor: failedRecords === 0 ? 'border-green-200' : 'border-red-200'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className={`${card.bgColor} ${card.borderColor} border rounded-lg p-6 transition-all duration-200 hover:shadow-md`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className={`text-2xl font-bold ${card.color} mt-1`}>{card.value}</p>
                <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>
              </div>
              <div className={`${card.color} opacity-80`}>
                <Icon size={24} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
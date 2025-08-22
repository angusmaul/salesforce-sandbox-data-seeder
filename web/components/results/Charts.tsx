import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface ChartData {
  successRateByObject: Array<{
    name: string;
    successRate: number;
    attempted: number;
    created: number;
    failed: number;
  }>;
  recordsDistribution: Array<{
    name: string;
    value: number;
    attempted: number;
  }>;
  processingTime: Array<{
    name: string;
    time: number;
  }>;
}

interface ChartsProps {
  chartData: ChartData;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function Charts({ chartData }: ChartsProps) {
  // Debug data
  console.log('Charts data:', chartData);
  
  if (!chartData) {
    return <div className="text-center text-gray-500">No chart data available</div>;
  }
  
  return (
    <div className="space-y-8">
      {/* Success Rate by Object - Bar Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Success Rate by Object</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.successRateByObject}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
              />
              <YAxis 
                label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
                domain={[0, 100]}
              />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'successRate' ? `${value}%` : value,
                  name === 'successRate' ? 'Success Rate' : name
                ]}
                labelFormatter={(label) => `Object: ${label}`}
              />
              <Bar 
                dataKey="successRate" 
                fill="#3B82F6" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Records Distribution - Vertical Bar Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Records Distribution</h3>
        {!chartData.recordsDistribution || chartData.recordsDistribution.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-gray-500">
            No records distribution data available
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData.recordsDistribution}
                margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
              >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
              />
              <YAxis 
                label={{ value: 'Records Created', angle: -90, position: 'insideLeft' }}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip 
                formatter={(value) => [`${value} records`, 'Records Created']}
                labelFormatter={(label) => `Object: ${label}`}
              />
              <Bar dataKey="value">
                {chartData.recordsDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Processing Time - Line Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Processing Time by Object</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.processingTime} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
              />
              <YAxis 
                label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value) => [`${value}ms`, 'Processing Time']}
                labelFormatter={(label) => `Object: ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey="time" 
                stroke="#10B981" 
                strokeWidth={3}
                dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
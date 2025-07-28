// pages/admin/email-analytics.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface EmailStats {
  total_sent: number;
  successful: number;
  failed: number;
  success_rate: number;
  templates: {
    [key: string]: {
      sent: number;
      successful: number;
      failed: number;
      success_rate: number;
    };
  };
  daily_stats: {
    date: string;
    sent: number;
    successful: number;
    failed: number;
  }[];
  recent_failures: {
    template_type: string;
    recipient_email: string;
    error_message: string;
    sent_at: string;
  }[];
}

interface AnalyticsResponse {
  success: boolean;
  period: string;
  stats: EmailStats;
  timestamp: string;
}

export default function EmailAnalytics() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(loadAnalytics, 60000); // 1 minute
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedPeriod]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/email-analytics?period=${selectedPeriod}`);
      const data = await response.json();
      
      if (data.success) {
        setAnalytics(data);
      } else {
        console.error('Analytics loading failed:', data.error);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 85) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTemplateTypeColor = (type: string) => {
    switch (type) {
      case 'day3_notify': return 'bg-blue-100 text-blue-800';
      case 'day5_choice': return 'bg-yellow-100 text-yellow-800';
      case 'day10_gift_notice': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL', {
      month: 'short',
      day: 'numeric'
    });
  };

  const periods = [
    { value: '1d', label: 'Laatste 24 uur' },
    { value: '7d', label: 'Laatste 7 dagen' },
    { value: '30d', label: 'Laatste 30 dagen' },
    { value: '90d', label: 'Laatste 90 dagen' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📊 Email Analytics</h1>
              <p className="text-gray-600 mt-1">Email delivery statistics en performance metrics</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/settings')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                ← Terug naar Settings
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-md text-sm ${
                  autoRefresh 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {autoRefresh ? '🔄 Auto Refresh ON' : '⏸️ Auto Refresh OFF'}
              </button>
              <button
                onClick={loadAnalytics}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Period Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📅 Periode Selectie</h2>
          <div className="flex gap-3 flex-wrap">
            {periods.map(period => (
              <button
                key={period.value}
                onClick={() => setSelectedPeriod(period.value)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  selectedPeriod === period.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
          {analytics && (
            <p className="text-sm text-gray-500 mt-3">
              Laatste update: {new Date(analytics.timestamp).toLocaleString()}
            </p>
          )}
        </div>

        {/* Overall Statistics */}
        {analytics && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">📈 Overzicht</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{analytics.stats.total_sent}</div>
                <div className="text-sm text-gray-500">Totaal Verzonden</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{analytics.stats.successful}</div>
                <div className="text-sm text-gray-500">Succesvol</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{analytics.stats.failed}</div>
                <div className="text-sm text-gray-500">Gefaald</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${getSuccessRateColor(analytics.stats.success_rate)}`}>
                  {analytics.stats.success_rate}%
                </div>
                <div className="text-sm text-gray-500">Success Rate</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Template Performance */}
          {analytics && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📧 Template Performance</h3>
              {Object.keys(analytics.stats.templates).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📭</div>
                  <p>Nog geen emails verzonden in deze periode</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(analytics.stats.templates).map(([templateType, stats]) => (
                    <div key={templateType} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-3 py-1 text-sm rounded-full ${getTemplateTypeColor(templateType)}`}>
                          {templateType}
                        </span>
                        <span className={`font-semibold ${getSuccessRateColor(stats.success_rate)}`}>
                          {stats.success_rate}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                          <div className="font-medium text-gray-900">{stats.sent}</div>
                          <div className="text-gray-500">Verzonden</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-green-600">{stats.successful}</div>
                          <div className="text-gray-500">Succesvol</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-red-600">{stats.failed}</div>
                          <div className="text-gray-500">Gefaald</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Daily Trend */}
          {analytics && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📈 Dagelijkse Trend</h3>
              {analytics.stats.daily_stats.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📊</div>
                  <p>Geen data beschikbaar voor deze periode</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.stats.daily_stats.slice(-7).map((day, index) => {
                    const successRate = day.sent > 0 ? (day.successful / day.sent) * 100 : 0;
                    return (
                      <div key={day.date} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900 w-16">
                            {formatDate(day.date)}
                          </span>
                          <div className="flex gap-4 text-sm">
                            <span>📧 {day.sent}</span>
                            <span className="text-green-600">✅ {day.successful}</span>
                            <span className="text-red-600">❌ {day.failed}</span>
                          </div>
                        </div>
                        <span className={`font-semibold ${getSuccessRateColor(successRate)}`}>
                          {Math.round(successRate)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Failures */}
        {analytics && analytics.stats.recent_failures.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🚨 Recente Failures</h3>
            <div className="space-y-3">
              {analytics.stats.recent_failures.map((failure, index) => (
                <div key={index} className="border-l-4 border-red-400 bg-red-50 p-4 rounded-r-md">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 text-xs rounded-full ${getTemplateTypeColor(failure.template_type)}`}>
                          {failure.template_type}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {failure.recipient_email}
                        </span>
                      </div>
                      <p className="text-sm text-red-800">{failure.error_message}</p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(failure.sent_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !analytics && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Analytics...</h3>
              <p className="text-gray-600">Berekenen van email statistieken</p>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">❓ Help & Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">📊 Metrics Uitleg</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• <strong>Totaal Verzonden:</strong> Aantal emails die zijn weggestuurd</li>
                <li>• <strong>Succesvol:</strong> Emails zonder errors</li>
                <li>• <strong>Gefaald:</strong> Emails met delivery errors</li>
                <li>• <strong>Success Rate:</strong> Percentage succesvolle deliveries</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">🎯 Success Rate Targets</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• <span className="text-green-600">✅ 95%+:</span> Excellent</li>
                <li>• <span className="text-yellow-600">⚠️ 85-94%:</span> Good, room for improvement</li>
                <li>• <span className="text-red-600">❌ &lt;85%:</span> Needs immediate attention</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">🛒 Replacement Orders</h3>
              <div className="space-y-2">
                <button
                  onClick={() => window.open('/admin/replacement-analytics', '_blank')}
                  className="w-full px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 text-sm"
                >
                  📈 View Replacement Analytics
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
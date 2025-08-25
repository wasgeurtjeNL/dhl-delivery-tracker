// pages/admin/replacement-analytics.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface ReplacementStats {
  total_requests: number;
  successful_orders: number;
  failed_orders: number;
  pending_orders: number;
  success_rate: number;
  top_products: {
    product_id: number;
    request_count: number;
  }[];
  daily_stats: {
    date: string;
    requests: number;
    successful: number;
    failed: number;
  }[];
  recent_requests: {
    tracking_code: string;
    customer_name: string;
    customer_email: string;
    selected_product_id: number;
    status: string;
    created_at: string;
    replacement_order_id?: string;
  }[];
  conversion_metrics: {
    day5_emails_sent: number;
    replacement_requests: number;
    conversion_rate: number;
  };
}

interface AnalyticsResponse {
  success: boolean;
  period: string;
  stats: ReplacementStats;
  timestamp: string;
}

export default function ReplacementAnalytics() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('30d');

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/replacement-analytics?period=${selectedPeriod}`);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL', {
      month: 'short',
      day: 'numeric'
    });
  };

  const periods = [
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
              <h1 className="text-2xl font-bold text-gray-900">📈 Replacement Analytics</h1>
              <p className="text-gray-600 mt-1">Statistieken van vervangingsproduct aanvragen</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/settings')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                ← Terug naar Settings
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
                    ? 'bg-purple-500 text-white'
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Totaal Aanvragen</p>
                    <p className="text-2xl font-bold text-gray-900">{analytics.stats.total_requests}</p>
                  </div>
                  <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600">📋</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Succesvolle Orders</p>
                    <p className="text-2xl font-bold text-green-600">{analytics.stats.successful_orders}</p>
                  </div>
                  <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600">✅</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Success Rate</p>
                    <p className="text-2xl font-bold text-purple-600">{analytics.stats.success_rate}%</p>
                  </div>
                  <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-purple-600">🎯</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Conversie Rate</p>
                    <p className="text-2xl font-bold text-orange-600">{analytics.stats.conversion_metrics.conversion_rate}%</p>
                  </div>
                  <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <span className="text-orange-600">📊</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Top Products */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">🏆 Populairste Vervangingsproducten</h3>
                {analytics.stats.top_products.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🛒</div>
                    <p>Nog geen replacement orders in deze periode</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analytics.stats.top_products.slice(0, 8).map((product, index) => (
                      <div key={product.product_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div className="flex items-center gap-3">
                          <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-1 rounded">
                            #{index + 1}
                          </span>
                          <span className="font-medium text-gray-900">Product ID: {product.product_id}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-600">
                          {product.request_count} aanvragen
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Daily Trend */}
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
                      const successRate = day.requests > 0 ? (day.successful / day.requests) * 100 : 0;
                      return (
                        <div key={day.date} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-900 w-16">
                              {formatDate(day.date)}
                            </span>
                            <div className="flex gap-4 text-sm">
                              <span>📋 {day.requests}</span>
                              <span className="text-green-600">✅ {day.successful}</span>
                              <span className="text-red-600">❌ {day.failed}</span>
                            </div>
                          </div>
                          <span className="font-semibold text-purple-600">
                            {Math.round(successRate)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Conversion Metrics */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">🔄 Conversie Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{analytics.stats.conversion_metrics.day5_emails_sent}</div>
                  <div className="text-sm text-gray-500">Day 5 Emails Verstuurd</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">{analytics.stats.conversion_metrics.replacement_requests}</div>
                  <div className="text-sm text-gray-500">Replacement Aanvragen</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{analytics.stats.conversion_metrics.conversion_rate}%</div>
                  <div className="text-sm text-gray-500">Email → Replacement Rate</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  Van de {analytics.stats.conversion_metrics.day5_emails_sent} Day 5 emails resulteerden er {analytics.stats.conversion_metrics.replacement_requests} in een replacement aanvraag
                </p>
              </div>
            </div>

            {/* Recent Requests */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Recente Replacement Aanvragen</h3>
              {analytics.stats.recent_requests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📝</div>
                  <p>Nog geen replacement aanvragen in deze periode</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Klant
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tracking Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Datum
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Order ID
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {analytics.stats.recent_requests.map((request, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{request.customer_name}</div>
                              <div className="text-sm text-gray-500">{request.customer_email}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-mono text-gray-900">{request.tracking_code}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900">{request.selected_product_id}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(request.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {request.replacement_order_id || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Loading State */}
        {loading && !analytics && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Analytics...</h3>
              <p className="text-gray-600">Berekenen van replacement statistieken</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
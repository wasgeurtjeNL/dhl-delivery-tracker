// pages/admin/environment-status.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface EnvironmentCheck {
  category: string;
  name: string;
  required: boolean;
  status: 'valid' | 'invalid' | 'warning' | 'testing';
  value?: string;
  message?: string;
  details?: any;
}

interface ValidationResult {
  success: boolean;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
  };
  checks: EnvironmentCheck[];
  recommendations: string[];
  timestamp: string;
}

export default function EnvironmentStatus() {
  const router = useRouter();
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    validateEnvironment();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(validateEnvironment, 30000); // 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const validateEnvironment = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/environment-check');
      const data = await response.json();
      
      if (data.success !== undefined) {
        setValidation(data);
      } else {
        console.error('Environment validation failed:', data.error);
      }
    } catch (error) {
      console.error('Failed to validate environment:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid': return '✅';
      case 'invalid': return '❌';
      case 'warning': return '⚠️';
      case 'testing': return '🔄';
      default: return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid': return 'text-green-600 bg-green-50 border-green-200';
      case 'invalid': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'testing': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Basic': return '⚙️';
      case 'Database': return '🗄️';
      case 'Email': return '📧';
      case 'WooCommerce': return '🛒';
      case 'Security': return '🔒';
      case 'Email Templates': return '📄';
      default: return '📋';
    }
  };

  const getOverallStatus = () => {
    if (!validation) return { icon: '🔄', text: 'Loading...', color: 'text-blue-600' };
    
    if (validation.summary.invalid > 0) {
      return { icon: '🚨', text: 'Critical Issues', color: 'text-red-600' };
    } else if (validation.summary.warnings > 0) {
      return { icon: '⚠️', text: 'Needs Attention', color: 'text-yellow-600' };
    } else {
      return { icon: '✅', text: 'All Systems Operational', color: 'text-green-600' };
    }
  };

  const groupedChecks = validation?.checks.reduce((groups, check) => {
    const category = check.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(check);
    return groups;
  }, {} as Record<string, EnvironmentCheck[]>) || {};

  const overallStatus = getOverallStatus();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🔧 Environment Status</h1>
              <p className="text-gray-600 mt-1">Valideer alle environment variables en API configuraties</p>
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
                onClick={validateEnvironment}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '🔄 Checking...' : '🔄 Check Now'}
              </button>
            </div>
          </div>
        </div>

        {/* Overall Status */}
        {validation && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="text-4xl">{overallStatus.icon}</div>
                <div>
                  <h2 className={`text-xl font-semibold ${overallStatus.color}`}>
                    {overallStatus.text}
                  </h2>
                  <p className="text-gray-600 text-sm">
                    Last checked: {new Date(validation.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{validation.summary.total}</div>
                <div className="text-sm text-gray-500">Total Checks</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{validation.summary.valid}</div>
                <div className="text-sm text-gray-500">Valid</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{validation.summary.warnings}</div>
                <div className="text-sm text-gray-500">Warnings</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{validation.summary.invalid}</div>
                <div className="text-sm text-gray-500">Critical</div>
              </div>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {validation && validation.recommendations.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">💡 Recommendations</h2>
            <div className="space-y-3">
              {validation.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <span className="text-lg">💡</span>
                  <p className="text-blue-800 flex-1">{recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Environment Checks by Category */}
        {validation && (
          <div className="space-y-6">
            {Object.entries(groupedChecks).map(([category, checks]) => (
              <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{getCategoryIcon(category)}</span>
                  <h3 className="text-lg font-semibold text-gray-900">{category}</h3>
                  <span className="text-sm text-gray-500">
                    ({checks.filter(c => c.status === 'valid').length}/{checks.length} valid)
                  </span>
                </div>
                
                <div className="space-y-3">
                  {checks.map((check, index) => (
                    <div key={index} className={`border rounded-lg p-4 ${getStatusColor(check.status)}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="text-xl">{getStatusIcon(check.status)}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{check.name}</h4>
                              {check.required && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="text-sm mt-1">{check.message}</p>
                            {check.value && (
                              <div className="mt-2">
                                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                                  {check.value}
                                </span>
                              </div>
                            )}
                            {check.details && (
                              <div className="mt-2 text-xs">
                                <details className="cursor-pointer">
                                  <summary className="font-medium">Show Details</summary>
                                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                                    {JSON.stringify(check.details, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading && !validation && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Validating Environment...</h3>
              <p className="text-gray-600">Checking all systems and configurations</p>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">❓ Help & Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">🔍 What We Check</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Environment variables configuration</li>
                <li>• Database connectivity and tables</li>
                <li>• Email service (Mandrill) status</li>
                <li>• WooCommerce API accessibility</li>
                <li>• Security and domain settings</li>
                <li>• Email templates validation</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">🚦 Status Meanings</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• ✅ <strong>Valid:</strong> Working correctly</li>
                <li>• ⚠️ <strong>Warning:</strong> Works but needs attention</li>
                <li>• ❌ <strong>Critical:</strong> Not working, requires fix</li>
                <li>• 🔄 <strong>Testing:</strong> Currently being checked</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
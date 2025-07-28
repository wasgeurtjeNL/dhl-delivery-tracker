// pages/admin/production-readiness.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface ProductionCheck {
  category: string;
  name: string;
  status: 'ready' | 'warning' | 'not_ready' | 'checking';
  importance: 'critical' | 'important' | 'recommended';
  message: string;
  action_required?: string;
  documentation_link?: string;
  details?: any;
}

interface ProductionReadiness {
  overall_status: 'ready' | 'needs_attention' | 'not_ready';
  critical_issues: number;
  warnings: number;
  checks: ProductionCheck[];
  next_steps: string[];
  deployment_guide: {
    domain_setup: string[];
    email_deliverability: string[];
    monitoring: string[];
    backup: string[];
  };
  timestamp: string;
}

export default function ProductionReadiness() {
  const router = useRouter();
  const [readiness, setReadiness] = useState<ProductionReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    checkProductionReadiness();
  }, []);

  const checkProductionReadiness = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/production-readiness');
      const data = await response.json();
      
      if (data.success !== false) {
        setReadiness(data);
      } else {
        console.error('Production readiness check failed:', data.error);
      }
    } catch (error) {
      console.error('Failed to check production readiness:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready': return '✅';
      case 'warning': return '⚠️';
      case 'not_ready': return '❌';
      case 'checking': return '🔄';
      default: return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'not_ready': return 'text-red-600 bg-red-50 border-red-200';
      case 'checking': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getImportanceIcon = (importance: string) => {
    switch (importance) {
      case 'critical': return '🚨';
      case 'important': return '⚠️';
      case 'recommended': return '💡';
      default: return '📋';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Domain & DNS': return '🌐';
      case 'Email Deliverability': return '📧';
      case 'Security': return '🔒';
      case 'Monitoring': return '📊';
      case 'Backup & Recovery': return '💾';
      case 'Environment': return '⚙️';
      default: return '📋';
    }
  };

  const getOverallStatusDisplay = () => {
    if (!readiness) return { icon: '🔄', text: 'Loading...', color: 'text-blue-600' };
    
    switch (readiness.overall_status) {
      case 'ready':
        return { icon: '🚀', text: 'Ready for Production!', color: 'text-green-600' };
      case 'needs_attention':
        return { icon: '⚠️', text: 'Needs Attention', color: 'text-yellow-600' };
      case 'not_ready':
        return { icon: '🚨', text: 'Not Ready for Production', color: 'text-red-600' };
      default:
        return { icon: '❓', text: 'Unknown Status', color: 'text-gray-600' };
    }
  };

  const groupedChecks = readiness?.checks.reduce((groups, check) => {
    const category = check.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(check);
    return groups;
  }, {} as Record<string, ProductionCheck[]>) || {};

  const overallStatus = getOverallStatusDisplay();

  const tabs = [
    { id: 'overview', label: '📊 Overview', icon: '📊' },
    { id: 'checks', label: '🔍 Detailed Checks', icon: '🔍' },
    { id: 'guide', label: '📋 Deployment Guide', icon: '📋' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🚀 Production Readiness</h1>
              <p className="text-gray-600 mt-1">Complete deployment checklist en system validation</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/settings')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                ← Terug naar Settings
              </button>
              <button
                onClick={checkProductionReadiness}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '🔄 Checking...' : '🔄 Check Again'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'overview' && readiness && (
          <>
            {/* Overall Status */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="text-4xl">{overallStatus.icon}</div>
                  <div>
                    <h2 className={`text-xl font-semibold ${overallStatus.color}`}>
                      {overallStatus.text}
                    </h2>
                    <p className="text-gray-600 text-sm">
                      Last checked: {new Date(readiness.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">{readiness.critical_issues}</div>
                  <div className="text-sm text-gray-500">Critical Issues</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">{readiness.warnings}</div>
                  <div className="text-sm text-gray-500">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {readiness.checks.filter(c => c.status === 'ready').length}
                  </div>
                  <div className="text-sm text-gray-500">Ready</div>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Next Steps</h2>
              <div className="space-y-3">
                {readiness.next_steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span className="text-lg">{step.startsWith('🚨') ? '🚨' : step.startsWith('⚠️') ? '⚠️' : '✅'}</span>
                    <p className="text-gray-700 flex-1">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Summary by Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(groupedChecks).map(([category, checks]) => {
                const readyCount = checks.filter(c => c.status === 'ready').length;
                const warningCount = checks.filter(c => c.status === 'warning').length;
                const notReadyCount = checks.filter(c => c.status === 'not_ready').length;
                
                return (
                  <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{getCategoryIcon(category)}</span>
                      <h3 className="font-semibold text-gray-900">{category}</h3>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">✅ Ready</span>
                        <span className="font-medium">{readyCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-yellow-600">⚠️ Warnings</span>
                        <span className="font-medium">{warningCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-red-600">❌ Issues</span>
                        <span className="font-medium">{notReadyCount}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'checks' && readiness && (
          <div className="space-y-6">
            {Object.entries(groupedChecks).map(([category, checks]) => (
              <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{getCategoryIcon(category)}</span>
                  <h3 className="text-lg font-semibold text-gray-900">{category}</h3>
                  <span className="text-sm text-gray-500">
                    ({checks.filter(c => c.status === 'ready').length}/{checks.length} ready)
                  </span>
                </div>
                
                <div className="space-y-3">
                  {checks.map((check, index) => (
                    <div key={index} className={`border rounded-lg p-4 ${getStatusColor(check.status)}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="text-xl">{getStatusIcon(check.status)}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{check.name}</h4>
                              <span className="text-xs">
                                {getImportanceIcon(check.importance)}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                check.importance === 'critical' ? 'bg-red-100 text-red-700' :
                                check.importance === 'important' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {check.importance}
                              </span>
                            </div>
                            <p className="text-sm mb-2">{check.message}</p>
                            {check.action_required && (
                              <div className="bg-white bg-opacity-70 rounded p-2 mb-2">
                                <p className="text-sm font-medium">Action Required:</p>
                                <p className="text-sm">{check.action_required}</p>
                              </div>
                            )}
                            {check.documentation_link && (
                              <a 
                                href={check.documentation_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 underline"
                              >
                                📖 Documentation
                              </a>
                            )}
                            {check.details && (
                              <details className="mt-2">
                                <summary className="text-sm font-medium cursor-pointer">Show Details</summary>
                                <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                                  {JSON.stringify(check.details, null, 2)}
                                </pre>
                              </details>
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

        {activeTab === 'guide' && readiness && (
          <div className="space-y-6">
            {Object.entries(readiness.deployment_guide).map(([section, steps]) => (
              <div key={section} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 capitalize">
                  {section.replace('_', ' ')} Setup
                </h3>
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-md">
                      <span className="text-blue-600 font-medium text-sm">{step.split('.')[0]}.</span>
                      <p className="text-gray-700 text-sm flex-1">{step.substring(step.indexOf('.') + 1).trim()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading && !readiness && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Checking Production Readiness...</h3>
              <p className="text-gray-600">Validating all systems for deployment</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
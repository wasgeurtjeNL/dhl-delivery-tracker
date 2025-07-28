// pages/admin/email-testing.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface TestResult {
  success: boolean;
  message: string;
  timestamp: string;
  details?: any;
}

interface FlowResult {
  step: string;
  description: string;
  success: boolean;
  result?: any;
  error?: string;
}

export default function EmailTesting() {
  const router = useRouter();
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [selectedTemplate, setSelectedTemplate] = useState('day3_notify');
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [validationResults, setValidationResults] = useState<any>(null);

  useEffect(() => {
    loadTemplates();
    validateTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await fetch('/api/admin/email-templates');
      const data = await response.json();
      
      if (data.success) {
        setTemplates(data.data.templates);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const validateTemplates = async () => {
    try {
      const response = await fetch('/api/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate_templates' })
      });

      const data = await response.json();
      if (data.success) {
        setValidationResults(data);
      }
    } catch (error) {
      console.error('Failed to validate templates:', error);
    }
  };

  const runTest = async (action: string, extraData?: any) => {
    setTesting(true);
    try {
      const response = await fetch('/api/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          testEmail,
          templateType: selectedTemplate,
          ...extraData
        })
      });

      const result = await response.json();
      
      // Add result to history
      const newResult: TestResult = {
        success: result.success,
        message: result.message || (result.success ? 'Test successful' : 'Test failed'),
        timestamp: new Date().toISOString(),
        details: result
      };

      setTestResults(prev => [newResult, ...prev.slice(0, 9)]); // Keep last 10 results

      if (result.success) {
        alert(`✅ ${result.message}`);
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error) {
      const newResult: TestResult = {
        success: false,
        message: `Test failed: ${error}`,
        timestamp: new Date().toISOString()
      };
      setTestResults(prev => [newResult, ...prev.slice(0, 9)]);
      alert(`❌ Test failed: ${error}`);
    } finally {
      setTesting(false);
    }
  };

  const getTemplateTypeColor = (type: string) => {
    switch (type) {
      case 'day3_notify': return 'bg-blue-100 text-blue-800';
      case 'day5_choice': return 'bg-yellow-100 text-yellow-800';
      case 'day10_gift_notice': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getValidationIcon = (valid: boolean) => {
    return valid ? '✅' : '❌';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🧪 Email Testing Dashboard</h1>
              <p className="text-gray-600 mt-1">Test email templates en flows end-to-end</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/settings')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                ← Terug naar Settings
              </button>
              <button
                onClick={() => router.push('/admin/email-template-editor')}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                ✏️ Template Editor
              </button>
            </div>
          </div>
        </div>

        {/* Template Validation Status */}
        {validationResults && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Template Validatie</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{validationResults.summary.total}</div>
                <div className="text-sm text-gray-500">Totaal Templates</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{validationResults.summary.valid}</div>
                <div className="text-sm text-gray-500">Geldig</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{validationResults.summary.invalid}</div>
                <div className="text-sm text-gray-500">Ongeldig</div>
              </div>
            </div>
            
            <div className="space-y-2">
              {validationResults.validation_results.map((result: any) => (
                <div key={result.template_type} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getValidationIcon(result.valid)}</span>
                    <div>
                      <span className="font-medium">{result.display_name}</span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${getTemplateTypeColor(result.template_type)}`}>
                        {result.template_type}
                      </span>
                    </div>
                  </div>
                  {result.issues.length > 0 && (
                    <div className="text-xs text-red-600">
                      {result.issues.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Test Controls */}
          <div className="space-y-6">
            {/* Test Configuration */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">⚙️ Test Configuratie</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Test Email Adres
                  </label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="test@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Type (voor single test)
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    {templates.map(template => (
                      <option key={template.template_type} value={template.template_type}>
                        {template.display_name} ({template.template_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Test Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">🚀 Test Acties</h2>
              <div className="space-y-3">
                <button
                  onClick={() => runTest('test_single_template')}
                  disabled={testing}
                  className="w-full px-4 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testing ? '🔄' : '📧'} Test Enkele Template
                </button>

                <button
                  onClick={() => runTest('test_all_templates')}
                  disabled={testing}
                  className="w-full px-4 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testing ? '🔄' : '📧📧📧'} Test Alle Templates
                </button>

                <button
                  onClick={() => runTest('test_email_flow')}
                  disabled={testing}
                  className="w-full px-4 py-3 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testing ? '🔄' : '🔄'} Test Complete Email Flow
                </button>

                <button
                  onClick={validateTemplates}
                  disabled={testing}
                  className="w-full px-4 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testing ? '🔄' : '✅'} Valideer Templates
                </button>
              </div>

              {testing && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin text-xl">🔄</div>
                    <span className="text-blue-800">Test wordt uitgevoerd...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Test Results */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Test Resultaten</h2>
            {testResults.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🧪</div>
                <p>Nog geen tests uitgevoerd</p>
                <p className="text-sm">Start een test om resultaten te zien</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {testResults.map((result, index) => (
                  <div 
                    key={index}
                    className={`p-4 rounded-md border ${
                      result.success 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {result.success ? '✅' : '❌'}
                        </span>
                        <div>
                          <p className={`font-medium ${
                            result.success ? 'text-green-800' : 'text-red-800'
                          }`}>
                            {result.message}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(result.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {result.details?.summary && (
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="flex gap-4">
                          <span>Total: {result.details.summary.total}</span>
                          <span className="text-green-600">Success: {result.details.summary.successful}</span>
                          {result.details.summary.failed > 0 && (
                            <span className="text-red-600">Failed: {result.details.summary.failed}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {result.details?.flow_results && (
                      <div className="mt-2 space-y-1">
                        {result.details.flow_results.map((flowResult: FlowResult, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span>{flowResult.success ? '✅' : '❌'}</span>
                            <span>{flowResult.step}</span>
                            <span className="text-gray-500">- {flowResult.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">❓ Help & Uitleg</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">🧪 Test Types</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li><strong>Enkele Template:</strong> Test één specifieke template</li>
                <li><strong>Alle Templates:</strong> Test alle actieve templates achter elkaar</li>
                <li><strong>Email Flow:</strong> Simuleert dag 3 → dag 5 → dag 10 flow</li>
                <li><strong>Validatie:</strong> Controleert template structuur</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">📧 Wat te controleren</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Emails komen aan in je inbox</li>
                <li>• Templates zien er correct uit</li>
                <li>• Merge variables zijn correct vervangen</li>
                <li>• Buttons in dag 5 email werken</li>
                <li>• Geen spam folder plaatsing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
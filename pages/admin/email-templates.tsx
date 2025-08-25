// pages/admin/email-templates.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface TemplateVerification {
  name: string;
  exists: boolean;
  testEmailSent: boolean;
  error?: string;
  purpose: string;
  mergeVars: string[];
  mandrill_id?: string;
  created_at?: string;
}

interface VerificationResponse {
  success: boolean;
  timestamp: string;
  environment: {
    mandrill_api_key: boolean;
    mandrill_key_format: boolean;
    from_email: string;
    from_name: string;
  };
  templates: TemplateVerification[];
  summary: {
    total: number;
    existing: number;
    missing: number;
    allValid: boolean;
  };
}

interface MandrillTemplate {
  name: string;
  slug: string;
  subject: string;
  publish_name: string;
  created_at: string;
  updated_at: string;
  published_at: string;
}

export default function EmailTemplates() {
  const router = useRouter();
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<MandrillTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [sendingTest, setSendingTest] = useState<string | null>(null);

  useEffect(() => {
    verifyTemplates();
    fetchAvailableTemplates();
  }, []);

  const verifyTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/email-template-verification');
      const data = await response.json();
      
      if (data.success) {
        setVerification(data);
      } else {
        console.error('Template verification failed:', data.error);
      }
    } catch (error) {
      console.error('Failed to verify templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableTemplates = async () => {
    setLoadingAvailable(true);
    try {
      const response = await fetch('/api/admin/mandrill-templates-list');
      const data = await response.json();
      
      if (data.success) {
        setAvailableTemplates(data.templates);
        console.log(`📧 Found ${data.total} available templates in Mandrill`);
      } else {
        console.error('Failed to fetch available templates:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch available templates:', error);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const sendTestEmail = async (templateName: string) => {
    setSendingTest(templateName);
    try {
      const response = await fetch('/api/admin/email-template-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName,
          testEmail
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Test email verstuurd naar ${testEmail} voor template ${templateName}`);
      } else {
        alert(`❌ Fout bij versturen test email: ${data.message}`);
      }
    } catch (error) {
      alert(`❌ Fout bij versturen test email: ${error}`);
    } finally {
      setSendingTest(null);
    }
  };

  const getStatusIcon = (template: TemplateVerification) => {
    if (template.exists) {
      return <span className="text-green-500 text-xl">✅</span>;
    } else {
      return <span className="text-red-500 text-xl">❌</span>;
    }
  };

  const getStatusText = (template: TemplateVerification) => {
    if (template.exists) {
      return <span className="text-green-600 font-medium">Template Bestaat</span>;
    } else {
      return <span className="text-red-600 font-medium">Template Ontbreekt</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📧 Email Template Verificatie</h1>
              <p className="text-gray-600 mt-1">Controleer en test alle Mandrill email templates</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/settings')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                ← Terug naar Settings
              </button>
              <button
                onClick={() => {
                  verifyTemplates();
                  fetchAvailableTemplates();
                }}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '🔄 Verifying...' : '🔄 Herverifieer Templates'}
              </button>
            </div>
          </div>
        </div>

        {/* Available Templates in Mandrill */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">📋 Beschikbare Templates in Mandrill</h2>
            <button
              onClick={fetchAvailableTemplates}
              disabled={loadingAvailable}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            >
              {loadingAvailable ? '🔄' : '🔄 Refresh'}
            </button>
          </div>
          
          {availableTemplates.length > 0 ? (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Gevonden: <strong>{availableTemplates.length} templates</strong> in je Mandrill account
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableTemplates.map((template) => (
                  <div key={template.name} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{template.subject}</p>
                    <div className="text-xs text-gray-500 mt-2">
                      <div>Slug: {template.slug}</div>
                      <div>Updated: {new Date(template.updated_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              {loadingAvailable ? (
                <div>
                  <div className="text-2xl mb-2">🔄</div>
                  <p className="text-gray-600">Templates laden...</p>
                </div>
              ) : (
                <div>
                  <div className="text-2xl mb-2">📭</div>
                  <p className="text-gray-600">Geen templates gevonden in Mandrill account</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Environment Status */}
        {verification && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🔧 Environment Setup</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl mb-2">
                  {verification.environment.mandrill_api_key ? '✅' : '❌'}
                </div>
                <div className="text-sm font-medium text-gray-900">Mandrill API Key</div>
                <div className="text-xs text-gray-500">
                  {verification.environment.mandrill_api_key ? 'Geconfigureerd' : 'Ontbreekt'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">
                  {verification.environment.mandrill_key_format ? '✅' : '⚠️'}
                </div>
                <div className="text-sm font-medium text-gray-900">Key Format</div>
                <div className="text-xs text-gray-500">
                  {verification.environment.mandrill_key_format ? 'Correct (md-*)' : 'Check format'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">📧</div>
                <div className="text-sm font-medium text-gray-900">From Email</div>
                <div className="text-xs text-gray-500">{verification.environment.from_email}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">🏷️</div>
                <div className="text-sm font-medium text-gray-900">From Name</div>
                <div className="text-xs text-gray-500">{verification.environment.from_name}</div>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        {verification && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Template Overzicht</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{verification.summary.total}</div>
                <div className="text-sm text-gray-500">Totaal Templates</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{verification.summary.existing}</div>
                <div className="text-sm text-gray-500">Bestaand</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{verification.summary.missing}</div>
                <div className="text-sm text-gray-500">Ontbrekend</div>
              </div>
              <div className="text-center">
                <div className="text-3xl">
                  {verification.summary.allValid ? '✅' : '❌'}
                </div>
                <div className="text-sm text-gray-500">Status</div>
              </div>
            </div>
            {verification.summary.allValid && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-green-800 text-center font-medium">
                  🎉 Alle templates zijn correct geconfigureerd en beschikbaar!
                </p>
              </div>
            )}
            {!verification.summary.allValid && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-800 text-center font-medium">
                  ⚠️ Sommige templates ontbreken. Controleer de template namen hierboven.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Test Email Setup */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🧪 Test Email Setup</h2>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
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
            <button
              onClick={verifyTemplates}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Email Bijwerken
            </button>
          </div>
        </div>

        {/* Template Details */}
        {verification && (
          <div className="space-y-6">
            {verification.templates.map((template, index) => (
              <div key={template.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(template)}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                      <p className="text-sm text-gray-600">{template.purpose}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusText(template)}
                    {template.mandrill_id && (
                      <div className="text-xs text-gray-500 mt-1">
                        ID: {template.mandrill_id}
                      </div>
                    )}
                  </div>
                </div>

                {template.error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-800 text-sm">❌ {template.error}</p>
                    <p className="text-red-600 text-xs mt-1">
                      💡 Tip: Controleer de template naam in de lijst hierboven
                    </p>
                  </div>
                )}

                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Required Merge Variables:</h4>
                  <div className="flex flex-wrap gap-2">
                    {template.mergeVars.map(variable => (
                      <span 
                        key={variable}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md font-mono"
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => sendTestEmail(template.name)}
                    disabled={!template.exists || sendingTest === template.name}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingTest === template.name ? (
                      '📧 Versturen...'
                    ) : template.exists ? (
                      '📧 Test Email Versturen'
                    ) : (
                      '❌ Template Ontbreekt'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading && !verification && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Verificatie Templates...</h3>
              <p className="text-gray-600">We controleren alle email templates in Mandrill</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
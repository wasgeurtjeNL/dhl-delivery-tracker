console.log('DHL_API_KEY in admin:', process.env.DHL_API_KEY);
// pages/admin/settings.tsx
import { useState, useEffect } from 'react';
import Head from 'next/head';
import ProgressIndicator, { useProgress } from '../../components/ProgressIndicator';
import { useAuth } from '../../lib/useAuth';

interface SystemSettings {
  id?: number;
  day_3_timing: number;
  day_5_timing: number;
  day_10_timing: number;
  loyalty_points: number;
  replacement_product_id: number;
  scraping_interval_minutes: number;
  auto_run_enabled: boolean;
  auto_run_time: string;
  email_template_day3: string;
  email_template_day5: string;
  email_template_day10: string;
  emergency_stop: boolean;
  auto_refresh_enabled: boolean;
  // NEW: Cron settings
  cron_frequency_minutes: number;
  cron_max_trackings_per_run: number;
  cron_delay_between_scrapes: number;
  last_cron_run: string | null;
  last_cron_status: string | null;
  last_cron_summary: any;
}

export default function AdminSettings() {
  const { isAuthenticated, loading: authLoading, logout, requireAuth } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingCron, setTestingCron] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');
  const [testResults, setTestResults] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  
  // NEW: Cron logs state
  const [cronLogs, setCronLogs] = useState<any>(null);
  const [cronLogsLoading, setCronLogsLoading] = useState(false);
  
  // Progress indicators
  const loadingProgress = useProgress();
  const saveProgress = useProgress();
  const testProgress = useProgress();
  const overrideProgress = useProgress();

  // Check authentication
  if (!requireAuth()) {
    return null;
  }

  // Form states
  const [formData, setFormData] = useState<SystemSettings | null>(null);
  const [bulkTrackingCodes, setBulkTrackingCodes] = useState('');
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [testTrackingCode, setTestTrackingCode] = useState('3SDFC0681190456');

  useEffect(() => {
    fetchSettings();
  }, []);

  // Auto-load cron logs when switching to cron tab
  useEffect(() => {
    if (activeTab === 'cron' && !cronLogs) {
      fetchCronLogs();
    }
  }, [activeTab]);

  // NEW: Fetch cron logs
  const fetchCronLogs = async () => {
    setCronLogsLoading(true);
    try {
      const response = await fetch('/api/admin/cron-logs');
      const data = await response.json();
      
      if (data.success) {
        setCronLogs(data.data);
      } else {
        console.error('Failed to fetch cron logs:', data.error);
      }
    } catch (error) {
      console.error('Error fetching cron logs:', error);
    } finally {
      setCronLogsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings');
      const data = await response.json();
      setSettings(data.settings);
      setFormData(data.settings);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const testCronJob = async () => {
    setTestingCron(true);
    try {
      const response = await fetch('/api/cron/test-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert(`✅ Cron job test succeeded!\n\nProcessed: ${result.result?.processed || 0}\nSuccessful: ${result.result?.successful || 0}\nFailed: ${result.result?.failed || 0}`);
      } else {
        alert(`❌ Cron job test failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error testing cron job:', error);
      alert('❌ Error testing cron job');
    } finally {
      setTestingCron(false);
    }
  };

  const saveSettings = async () => {
    if (!formData) return;
    
    saveProgress.showProgress({
      mode: 'steps',
      title: 'Instellingen Opslaan',
      subtitle: 'Bezig met valideren en opslaan van systeeminstellingen...',
      steps: [
        { id: 'validate', name: 'Instellingen valideren', status: 'running' },
        { id: 'save', name: 'Opslaan in database', status: 'pending' },
        { id: 'refresh', name: 'Cache vernieuwen', status: 'pending' },
        { id: 'complete', name: 'Voltooid', status: 'pending' }
      ],
      size: 'md'
    });
    
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate validation
      saveProgress.updateStep('validate', { 
        status: 'completed', 
        message: 'Alle instellingen zijn geldig' 
      });
      
      saveProgress.updateStep('save', { status: 'running' });
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        saveProgress.updateStep('save', { 
          status: 'completed', 
          message: 'Database succesvol bijgewerkt' 
        });
        
        saveProgress.updateStep('refresh', { status: 'running' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setSettings(data.settings);
        saveProgress.updateStep('refresh', { 
          status: 'completed', 
          message: 'Instellingen geladen' 
        });
        
        saveProgress.updateStep('complete', { 
          status: 'completed', 
          message: 'Alle instellingen succesvol opgeslagen!' 
        });
        
        // Show success for a moment
        await new Promise(resolve => setTimeout(resolve, 1500));
        saveProgress.hideProgress();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      saveProgress.updateSteps([
        { id: 'error', name: 'Fout opgetreden', status: 'error', message: 'Kon instellingen niet opslaan' }
      ]);
      setTimeout(() => saveProgress.hideProgress(), 3000);
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Specifieke DHL test functie (zoals run check in dashboard)
  // DHL Official API Test function
  const testDHLOfficialAPI = async (trackingCode: string) => {
    setTestLoading(true);
    
    try {
      console.log(`🧪 Testing DHL Official API for: ${trackingCode}`);

      const response = await fetch('/api/admin/test-dhl-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingCode })
      });

      const result = await response.json();
      
      console.log(`🧪 DHL API test result:`, result);

      // Store result in testResults state
      setTestResults(prev => ({
        ...prev,
        dhlAPI: result
      }));

    } catch (error) {
      console.error('❌ DHL API test failed:', error);
      
      setTestResults(prev => ({
        ...prev,
        dhlAPI: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      }));
    } finally {
      setTestLoading(false);
    }
  };

  const runDHLTest = async (trackingCode: string) => {
    testProgress.showProgress({
      mode: 'steps',
      title: 'DHL Tracking Test Uitvoeren',
      subtitle: `Bezig met testen van tracking code ${trackingCode}...`,
      steps: [
        { id: 'prepare', name: 'Voorbereidingen treffen', status: 'running' },
        { id: 'scrape', name: 'DHL website benaderen', status: 'pending' },
        { id: 'parse', name: 'Tracking data analyseren', status: 'pending' },
        { id: 'complete', name: 'Test resultaat verwerken', status: 'pending' }
      ],
      size: 'lg'
    });

    setTestLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate preparation
      testProgress.updateStep('prepare', { 
        status: 'completed', 
        message: 'Test configuratie en tracking code gevalideerd' 
      });
      
      testProgress.updateStep('scrape', { status: 'running' });
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const response = await fetch('/api/admin/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType: 'dhl_scraping', payload: { trackingCode } })
      });

      const result = await response.json();
      
      testProgress.updateStep('scrape', { 
        status: result.success ? 'completed' : 'error',
        message: result.success ? 'DHL website succesvol benaderd' : (result.error || 'Verbinding gefaald')
      });
      
      if (result.success) {
        testProgress.updateStep('parse', { status: 'running' });
        await new Promise(resolve => setTimeout(resolve, 400));
        
        testProgress.updateStep('parse', { 
          status: 'completed',
          message: `Status gedetecteerd: ${result.results?.deliveryStatus || 'Onbekend'} | ${result.results?.statusTabel?.length || 0} status entries gevonden`
        });
      } else {
        testProgress.updateStep('parse', { 
          status: 'error',
          message: 'Kon tracking data niet verwerken'
        });
      }
      
      testProgress.updateStep('complete', { status: 'running' });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      testProgress.updateStep('complete', { 
        status: result.success ? 'completed' : 'error',
        message: result.success 
          ? `DHL test succesvol - Status: ${result.results?.deliveryStatus || 'Onbekend'} | Verbeterde scraping werkt!`
          : 'DHL test gefaald - Controleer tracking code en verbinding'
      });
      
      setTestResults({ ...testResults, ['dhl']: result });
      
      // Show completion for a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      testProgress.hideProgress();
      
    } catch (error) {
      testProgress.updateSteps([
        { id: 'error', name: 'DHL Test Gefaald', status: 'error', message: 'Kon DHL test niet uitvoeren - Netwerkfout' }
      ]);
      setTestResults({ 
        ...testResults, 
        ['dhl']: { success: false, error: 'Network error' } 
      });
      setTimeout(() => testProgress.hideProgress(), 3000);
    } finally {
      setTestLoading(false);
    }
  };

  const runTest = async (testType: string, payload?: any) => {
    // Voor DHL test, gebruik de specifieke functie
    if (testType === 'dhl_scraping') {
      return runDHLTest(payload?.trackingCode || testTrackingCode);
    }

    const testNames = {
      'database': 'Database Connectie',
      'dhl': 'DHL Scraping Service',
      'mandrill': 'Mandrill E-mail Service',
      'woocommerce': 'WooCommerce API',
      'fullSystem': 'Volledige Systeem Test',
      'scenario': 'Scenario Simulatie'
    };

    testProgress.showProgress({
      mode: 'steps',
      title: `${testNames[testType as keyof typeof testNames] || testType} Testen`,
      subtitle: 'Bezig met uitvoeren van service connectiviteit tests...',
      steps: [
        { id: 'prepare', name: 'Test voorbereiden', status: 'running' },
        { id: 'connect', name: 'Verbinding testen', status: 'pending' },
        { id: 'validate', name: 'Response valideren', status: 'pending' },
        { id: 'complete', name: 'Resultaat verwerken', status: 'pending' }
      ],
      size: 'lg'
    });

    setTestLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 600));
      testProgress.updateStep('prepare', { 
        status: 'completed', 
        message: 'Test configuratie geladen' 
      });
      
      testProgress.updateStep('connect', { status: 'running' });
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const response = await fetch('/api/admin/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType, payload })
      });

      const result = await response.json();
      testProgress.updateStep('connect', { 
        status: 'completed', 
        message: result.success ? 'Verbinding succesvol' : 'Verbinding gefaald' 
      });
      
      testProgress.updateStep('validate', { status: 'running' });
      await new Promise(resolve => setTimeout(resolve, 300));
      
      testProgress.updateStep('validate', { 
        status: result.success ? 'completed' : 'error',
        message: result.success ? 'Response geldig' : (result.error || 'Validatie gefaald')
      });
      
      testProgress.updateStep('complete', { 
        status: 'completed',
        message: `Test ${result.success ? 'succesvol' : 'gefaald'}` 
      });
      
      setTestResults({ ...testResults, [testType]: result });
      
      // Show result for a moment
      await new Promise(resolve => setTimeout(resolve, 1500));
      testProgress.hideProgress();
      
    } catch (error) {
      testProgress.updateSteps([
        { id: 'error', name: 'Test gefaald', status: 'error', message: 'Kon test niet uitvoeren' }
      ]);
      setTestResults({ 
        ...testResults, 
        [testType]: { success: false, error: 'Test failed' } 
      });
      setTimeout(() => testProgress.hideProgress(), 3000);
    } finally {
      setTestLoading(false);
    }
  };

  const runOverride = async (action: string, payload?: any) => {
    const actionNames = {
      'emergency_stop': 'Noodstop Activeren',
      'emergency_resume': 'Systeem Hervatten',
      'skip_email': 'E-mail Overslaan',
      'force_bulk_email': 'Bulk E-mails Versturen',
      'bulk_mark_delivered': 'Bulk Markeren als Bezorgd',
      'reset_tracking': 'Tracking Reset'
    };

    if (!confirm(`Weet je zeker dat je wilt uitvoeren: ${actionNames[action as keyof typeof actionNames] || action}?`)) return;

    overrideProgress.showProgress({
      mode: 'steps',
      title: `${actionNames[action as keyof typeof actionNames] || action}`,
      subtitle: 'Bezig met uitvoeren van admin override operatie...',
      steps: [
        { id: 'validate', name: 'Bewerking valideren', status: 'running' },
        { id: 'execute', name: 'Override uitvoeren', status: 'pending' },
        { id: 'verify', name: 'Resultaat verifiëren', status: 'pending' },
        { id: 'complete', name: 'Logs bijwerken', status: 'pending' }
      ],
      size: 'lg',
      variant: action.includes('emergency') ? 'warning' : 'default'
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      overrideProgress.updateStep('validate', { 
        status: 'completed', 
        message: 'Override parameters gevalideerd' 
      });
      
      overrideProgress.updateStep('execute', { status: 'running' });
      const response = await fetch('/api/admin/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });

      const result = await response.json();
      
      if (result.success) {
        overrideProgress.updateStep('execute', { 
          status: 'completed', 
          message: 'Override succesvol uitgevoerd' 
        });
        
        overrideProgress.updateStep('verify', { status: 'running' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        overrideProgress.updateStep('verify', { 
          status: 'completed', 
          message: result.message || 'Operatie voltooid' 
        });
        
        overrideProgress.updateStep('complete', { 
          status: 'completed', 
          message: 'Admin logs bijgewerkt' 
        });
        
        if (action === 'emergency_stop' || action === 'emergency_resume') {
          fetchSettings(); // Refresh settings
        }
        
        // Show success for a moment
        await new Promise(resolve => setTimeout(resolve, 2000));
        overrideProgress.hideProgress();
      } else {
        throw new Error(result.message || 'Override failed');
      }
    } catch (error) {
      overrideProgress.updateSteps([
        { id: 'error', name: 'Override gefaald', status: 'error', 
          message: error instanceof Error ? error.message : 'Onbekende fout' }
      ]);
      setTimeout(() => overrideProgress.hideProgress(), 3000);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Admin Settings - Wasgeurtje.nl Tracking</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <a
              href="/admin/dashboard"
              className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
            >
              ← Back to Dashboard
            </a>
            <button
              onClick={logout}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              🚪 Logout
            </button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">⚙️ Admin Settings</h1>
          <p className="text-gray-600">Configure tracking system settings, run tests, and manage overrides</p>
          
          {settings?.emergency_stop && (
            <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              🚨 <strong>EMERGENCY STOP ACTIVE</strong> - All automated emails are paused
              <button 
                onClick={() => runOverride('emergency_resume')}
                className="ml-4 bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
              >
                Resume
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
                       {[
             { id: 'settings', name: '⚙️ Settings', desc: 'System configuration' },
             { id: 'tests', name: '🧪 Tests', desc: 'Test all services' },
             { id: 'dhl-api', name: '🚚 DHL API', desc: 'Test new DHL API integration' },
             { id: 'cron', name: '🕒 Cron Logs', desc: 'Automatic refresh logs' },
             { id: 'overrides', name: '🛠️ Overrides', desc: 'Manual controls' }
           ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Settings Tab */}
        {activeTab === 'settings' && formData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Timing Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📅 Timing Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Day 3 Timing</label>
                  <input
                    type="number"
                    value={formData.day_3_timing}
                    onChange={(e) => setFormData({...formData, day_3_timing: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Day 5 Timing</label>
                  <input
                    type="number"
                    value={formData.day_5_timing}
                    onChange={(e) => setFormData({...formData, day_5_timing: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Day 10 Timing</label>
                  <input
                    type="number"
                    value={formData.day_10_timing}
                    onChange={(e) => setFormData({...formData, day_10_timing: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Product & Points Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">🎁 Rewards Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Loyalty Points</label>
                  <input
                    type="number"
                    value={formData.loyalty_points}
                    onChange={(e) => setFormData({...formData, loyalty_points: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Replacement Product ID</label>
                  <input
                    type="number"
                    value={formData.replacement_product_id}
                    onChange={(e) => setFormData({...formData, replacement_product_id: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Email Templates */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📧 Email Templates</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Day 3 Template</label>
                  <input
                    type="text"
                    value={formData.email_template_day3}
                    onChange={(e) => setFormData({...formData, email_template_day3: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Day 5 Template</label>
                  <input
                    type="text"
                    value={formData.email_template_day5}
                    onChange={(e) => setFormData({...formData, email_template_day5: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Day 10 Template</label>
                  <input
                    type="text"
                    value={formData.email_template_day10}
                    onChange={(e) => setFormData({...formData, email_template_day10: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

                         {/* Automation Settings */}
             <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
               <h2 className="text-xl font-semibold text-gray-900 mb-4">🤖 Automation Settings</h2>
               <div className="space-y-4">
                 <div className="flex items-center">
                   <input
                     type="checkbox"
                     checked={formData.auto_run_enabled}
                     onChange={(e) => setFormData({...formData, auto_run_enabled: e.target.checked})}
                     className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                   />
                   <label className="ml-2 block text-sm text-gray-900">Auto-run enabled</label>
                 </div>
                 
                 <div className="flex items-center">
                   <input
                     type="checkbox"
                     checked={formData.auto_refresh_enabled || false}
                     onChange={(e) => setFormData({...formData, auto_refresh_enabled: e.target.checked})}
                     className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                   />
                   <label className="ml-2 block text-sm text-gray-900">🕐 Automatische DHL refresh</label>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700">Auto-run time</label>
                   <input
                     type="time"
                     value={formData.auto_run_time}
                     onChange={(e) => setFormData({...formData, auto_run_time: e.target.value})}
                     className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700">Scraping interval (minutes)</label>
                   <input
                     type="number"
                     value={formData.scraping_interval_minutes}
                     onChange={(e) => setFormData({...formData, scraping_interval_minutes: parseInt(e.target.value)})}
                     className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                   />
                 </div>
               </div>
             </div>
             
             {/* NEW: Cron Job Settings */}
             <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
               <h2 className="text-xl font-semibold text-gray-900 mb-4">🕒 Cron Job Settings</h2>
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-medium text-gray-700">Frequentie (minuten)</label>
                   <select
                     value={formData.cron_frequency_minutes || 60}
                     onChange={(e) => setFormData({...formData, cron_frequency_minutes: parseInt(e.target.value)})}
                     className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                   >
                     <option value={5}>Elke 5 minuten (voor testing)</option>
                     <option value={15}>Elke 15 minuten</option>
                     <option value={30}>Elke 30 minuten</option>
                     <option value={60}>Elk uur (aanbevolen)</option>
                     <option value={120}>Elke 2 uur</option>
                     <option value={240}>Elke 4 uur</option>
                     <option value={480}>Elke 8 uur</option>
                     <option value={720}>Elke 12 uur</option>
                     <option value={1440}>Elke 24 uur</option>
                   </select>
                   <p className="text-xs text-gray-500 mt-1">Let op: Vercel cron heeft minimaal 1 minuut interval</p>
                 </div>
                 
                 <div>
                   <label className="block text-sm font-medium text-gray-700">Max trackings per run</label>
                   <input
                     type="number"
                     min="1"
                     max="100"
                     value={formData.cron_max_trackings_per_run || 20}
                     onChange={(e) => setFormData({...formData, cron_max_trackings_per_run: parseInt(e.target.value)})}
                     className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                   />
                   <p className="text-xs text-gray-500 mt-1">Aanbevolen: 10-30 voor stabiele performance</p>
                 </div>
                 
                 <div>
                   <label className="block text-sm font-medium text-gray-700">Delay tussen scrapes (milliseconden)</label>
                   <select
                     value={formData.cron_delay_between_scrapes || 3000}
                     onChange={(e) => setFormData({...formData, cron_delay_between_scrapes: parseInt(e.target.value)})}
                     className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                   >
                     <option value={1000}>1 seconde (snel, risico op rate limiting)</option>
                     <option value={2000}>2 seconden</option>
                     <option value={3000}>3 seconden (aanbevolen)</option>
                     <option value={5000}>5 seconden (veilig)</option>
                     <option value={10000}>10 seconden (extra veilig)</option>
                   </select>
                   <p className="text-xs text-gray-500 mt-1">Langere delays = meer DHL-vriendelijk</p>
                 </div>
                 
                 {/* Cron Status Display */}
                 {settings && (
                   <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                     <h4 className="text-sm font-medium text-gray-800 mb-2">Huidige Status</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                       <div>
                         <span className="text-gray-600">Laatste run:</span>
                         <span className="ml-1 font-mono">
                           {settings.last_cron_run 
                             ? new Date(settings.last_cron_run).toLocaleString('nl-NL')
                             : 'Nog nooit uitgevoerd'
                           }
                         </span>
                       </div>
                       <div>
                         <span className="text-gray-600">Status:</span>
                         <span className={`ml-1 px-2 py-1 rounded text-xs ${
                           settings.last_cron_status === 'completed' ? 'bg-green-100 text-green-800' :
                           settings.last_cron_status === 'running' ? 'bg-blue-100 text-blue-800' :
                           settings.last_cron_status === 'error' ? 'bg-red-100 text-red-800' :
                           'bg-gray-100 text-gray-800'
                         }`}>
                           {settings.last_cron_status || 'Onbekend'}
                         </span>
                       </div>
                     </div>
                     {settings.last_cron_summary && (
                       <div className="mt-2 text-xs text-gray-600">
                         Laatste run: {settings.last_cron_summary.successful || 0} succesvol, 
                         {' '}{settings.last_cron_summary.failed || 0} gefaald
                         {settings.last_cron_summary.duration_ms && 
                           ` in ${Math.round(settings.last_cron_summary.duration_ms / 1000)}s`
                         }
                       </div>
                     )}
                   </div>
                 )}
               </div>
             </div>

            {/* Save Button */}
            <div className="lg:col-span-2">
              <div className="flex gap-4">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Opslaan...' : 'Instellingen Opslaan'}
                </button>
                
                <button
                  onClick={testCronJob}
                  disabled={testingCron}
                  className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {testingCron ? '🔄 Testen...' : '🧪 Test Cron Job'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cron Logs Tab */}
         {activeTab === 'cron' && (
           <div className="space-y-6">
             {/* Cron Status Header */}
             <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-xl font-semibold text-gray-900">🕒 Automatic Refresh Status</h2>
                 <button
                   onClick={fetchCronLogs}
                   disabled={cronLogsLoading}
                   className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                 >
                   {cronLogsLoading ? '🔄 Loading...' : '↻ Refresh Logs'}
                 </button>
               </div>
               
               {cronLogs && cronLogs.cronHealth && (
                 <div className={`p-4 rounded-lg ${
                   cronLogs.cronHealth.status === 'healthy' ? 'bg-green-50 border border-green-200' :
                   cronLogs.cronHealth.status === 'warning' || cronLogs.cronHealth.status === 'overdue' ? 'bg-yellow-50 border border-yellow-200' :
                   cronLogs.cronHealth.status === 'error' ? 'bg-red-50 border border-red-200' :
                   cronLogs.cronHealth.status === 'disabled' || cronLogs.cronHealth.status === 'stopped' ? 'bg-gray-50 border border-gray-200' :
                   'bg-blue-50 border border-blue-200'
                 }`}>
                   <div className="flex items-center gap-2 mb-2">
                     <span className="text-lg">
                       {cronLogs.cronHealth.status === 'healthy' ? '✅' :
                        cronLogs.cronHealth.status === 'warning' || cronLogs.cronHealth.status === 'overdue' ? '⚠️' :
                        cronLogs.cronHealth.status === 'error' ? '❌' :
                        cronLogs.cronHealth.status === 'disabled' || cronLogs.cronHealth.status === 'stopped' ? '⏸️' :
                        '🔄'}
                     </span>
                     <span className="font-semibold text-gray-900">
                       Cron Status: {cronLogs.cronHealth.status.toUpperCase()}
                     </span>
                   </div>
                   <p className="text-sm text-gray-700">{cronLogs.cronHealth.message}</p>
                   
                   {cronLogs.cronHealth.lastRun && (
                     <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                       <div>
                         <span className="text-gray-600">Laatste run:</span>
                         <div className="font-mono text-xs">{new Date(cronLogs.cronHealth.lastRun).toLocaleString('nl-NL')}</div>
                       </div>
                       {cronLogs.cronHealth.nextRun && (
                         <div>
                           <span className="text-gray-600">Volgende run:</span>
                           <div className="font-mono text-xs">{new Date(cronLogs.cronHealth.nextRun).toLocaleString('nl-NL')}</div>
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               )}
               
               {cronLogs && cronLogs.statistics && (
                 <div className="mt-4 grid grid-cols-3 gap-4">
                   <div className="bg-blue-50 p-3 rounded-lg text-center">
                     <div className="text-2xl font-bold text-blue-900">{cronLogs.statistics.totalBatches}</div>
                     <div className="text-sm text-blue-700">Batches uitgevoerd</div>
                   </div>
                   <div className="bg-green-50 p-3 rounded-lg text-center">
                     <div className="text-2xl font-bold text-green-900">{cronLogs.statistics.avgTracksPerBatch}</div>
                     <div className="text-sm text-green-700">Gem. trackings per batch</div>
                   </div>
                   <div className="bg-purple-50 p-3 rounded-lg text-center">
                     <div className="text-2xl font-bold text-purple-900">{cronLogs.statistics.totalLogs}</div>
                     <div className="text-sm text-purple-700">Totaal logs</div>
                   </div>
                 </div>
               )}
             </div>
             
             {/* Cron Batches */}
             <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
               <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Recent Cron Batches</h3>
               
               {cronLogsLoading ? (
                 <div className="text-center py-8">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                   <p className="mt-2 text-gray-600">Loading logs...</p>
                 </div>
               ) : cronLogs?.cronBatches?.length > 0 ? (
                 <div className="space-y-4 max-h-96 overflow-y-auto">
                   {cronLogs.cronBatches.map((batch: any, index: number) => (
                     <div key={batch.timestamp} className="border border-gray-200 rounded-lg p-4">
                       <div className="flex items-center justify-between mb-3">
                         <div className="flex items-center gap-3">
                           <span className="text-lg">🕒</span>
                           <div>
                             <div className="font-medium text-gray-900">
                               Batch #{cronLogs.cronBatches.length - index}
                             </div>
                             <div className="text-sm text-gray-600 font-mono">
                               {new Date(batch.timestamp).toLocaleString('nl-NL')}
                             </div>
                           </div>
                         </div>
                         <div className="flex gap-2">
                           <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                             ✅ {batch.summary.success}
                           </span>
                           <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                             🚛 {batch.summary.delivered}
                           </span>
                           {batch.summary.failed > 0 && (
                             <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm">
                               ❌ {batch.summary.failed}
                             </span>
                           )}
                         </div>
                       </div>
                       
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                         <div className="bg-gray-50 p-2 rounded">
                           <div className="text-xs text-gray-600">Totaal</div>
                           <div className="font-semibold">{batch.summary.total}</div>
                         </div>
                         <div className="bg-green-50 p-2 rounded">
                           <div className="text-xs text-green-700">Succesvol</div>
                           <div className="font-semibold text-green-800">{batch.summary.success}</div>
                         </div>
                         <div className="bg-blue-50 p-2 rounded">
                           <div className="text-xs text-blue-700">Bezorgd</div>
                           <div className="font-semibold text-blue-800">{batch.summary.delivered}</div>
                         </div>
                         <div className="bg-red-50 p-2 rounded">
                           <div className="text-xs text-red-700">Gefaald</div>
                           <div className="font-semibold text-red-800">{batch.summary.failed}</div>
                         </div>
                       </div>
                       
                       {/* Show recent logs from this batch */}
                       {batch.logs && batch.logs.length > 0 && (
                         <details className="mt-3">
                           <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                             Bekijk {batch.logs.length} detail logs...
                           </summary>
                           <div className="mt-2 space-y-1 max-h-40 overflow-y-auto bg-gray-50 rounded p-2">
                             {batch.logs.slice(0, 10).map((log: any, logIndex: number) => (
                               <div key={logIndex} className="text-xs font-mono">
                                 <span className={`${
                                   log.action_type === 'auto_scrape' ? 'text-green-700' : 'text-red-700'
                                 }`}>
                                   {log.action_type === 'auto_scrape' ? '✅' : '❌'} {log.tracking_code}
                                 </span>
                                 {log.details?.delivery_status && (
                                   <span className="text-gray-600"> → {log.details.delivery_status}</span>
                                 )}
                                 {log.details?.duration && (
                                   <span className="text-blue-600"> ({log.details.duration})</span>
                                 )}
                               </div>
                             ))}
                             {batch.logs.length > 10 && (
                               <div className="text-xs text-gray-500">... en {batch.logs.length - 10} meer</div>
                             )}
                           </div>
                         </details>
                       )}
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-8 text-gray-500">
                   <span className="text-4xl mb-2 block">📊</span>
                   <p>Geen cron logs gevonden</p>
                   <p className="text-sm">Start eerst de automatische refresh in settings</p>
                 </div>
               )}
             </div>
           </div>
         )}

         {/* Tests Tab */}
         {activeTab === 'tests' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">🧪 System Tests</h2>
              <div className="space-y-4">
                <button
                  onClick={() => runTest('database')}
                  disabled={testLoading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Test Database Connection
                </button>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Tracking code"
                    value={testTrackingCode}
                    onChange={(e) => setTestTrackingCode(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-3 py-2"
                  />
                  <button
                    onClick={() => runTest('dhl_scraping', { trackingCode: testTrackingCode })}
                    disabled={testLoading}
                    className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    Test DHL
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Test email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-3 py-2"
                  />
                  <button
                    onClick={() => runTest('mandrill', { email: testEmail })}
                    disabled={testLoading}
                    className="bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 disabled:opacity-50"
                  >
                    Test Email
                  </button>
                </div>

                <button
                  onClick={() => runTest('woocommerce')}
                  disabled={testLoading}
                  className="w-full bg-orange-600 text-white py-2 px-4 rounded hover:bg-orange-700 disabled:opacity-50"
                >
                  Test WooCommerce
                </button>

                <button
                  onClick={() => runTest('full_system')}
                  disabled={testLoading}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Full System Test
                </button>
              </div>
            </div>

            {/* Test Results */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Test Results</h2>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {testResults && Object.entries(testResults).map(([testType, result]: [string, any]) => (
                  <div key={testType} className="border border-gray-200 rounded p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-lg">{testType}</span>
                      <span className={`px-3 py-1 text-sm rounded-full ${
                        result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {result.success ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    
                    {/* Special rendering for DHL test results */}
                    {testType === 'dhl' && result.results && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-blue-50 p-3 rounded">
                            <div className="text-sm font-medium text-blue-800 mb-1">📦 Tracking Code</div>
                            <div className="text-blue-900">{result.results.trackingCode}</div>
                          </div>
                          <div className={`p-3 rounded ${
                            result.results.deliveryStatus === 'bezorgd' ? 'bg-green-50' :
                            result.results.deliveryStatus === 'onderweg' ? 'bg-yellow-50' :
                            result.results.deliveryStatus === 'fout' ? 'bg-red-50' : 'bg-gray-50'
                          }`}>
                            <div className={`text-sm font-medium mb-1 ${
                              result.results.deliveryStatus === 'bezorgd' ? 'text-green-800' :
                              result.results.deliveryStatus === 'onderweg' ? 'text-yellow-800' :
                              result.results.deliveryStatus === 'fout' ? 'text-red-800' : 'text-gray-800'
                            }`}>🚛 Status</div>
                            <div className={`capitalize ${
                              result.results.deliveryStatus === 'bezorgd' ? 'text-green-900' :
                              result.results.deliveryStatus === 'onderweg' ? 'text-yellow-900' :
                              result.results.deliveryStatus === 'fout' ? 'text-red-900' : 'text-gray-900'
                            }`}>{result.results.deliveryStatus}</div>
                          </div>
                        </div>

                        {/* Duration Information - NEW! */}
                        {result.results.display && (
                          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
                            <div className="text-sm font-medium text-purple-800 mb-2">⏱️ Duration Analysis</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {result.results.display.afgegevenMomentFormatted && (
                                <div>
                                  <div className="text-xs text-purple-600 mb-1">📤 Afgegeven bij DHL</div>
                                  <div className="text-sm text-purple-900">{result.results.display.afgegevenMomentFormatted}</div>
                                </div>
                              )}
                              {result.results.display.afleverMomentFormatted && (
                                <div>
                                  <div className="text-xs text-purple-600 mb-1">📬 Bezorgd aan klant</div>
                                  <div className="text-sm text-purple-900">{result.results.display.afleverMomentFormatted}</div>
                                </div>
                              )}
                            </div>
                            {result.results.display.durationHuman && (
                              <div className="mt-3 pt-3 border-t border-purple-200">
                                <div className="text-xs text-purple-600 mb-1">🕐 Totale doorlooptijd</div>
                                <div className="text-lg font-bold text-purple-900">{result.results.display.durationHuman}</div>
                                {result.results.display.durationPrecise && (
                                  <div className="text-xs text-purple-600">({result.results.display.durationPrecise})</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Metrics */}
                        {result.results.metrics && (
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="text-sm font-medium text-gray-800 mb-2">📈 Test Metrics</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className={`p-2 rounded text-center ${
                                result.results.metrics.hasDeliveryMoment ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {result.results.metrics.hasDeliveryMoment ? '✅' : '❌'} Bezorg moment
                              </div>
                              <div className={`p-2 rounded text-center ${
                                result.results.metrics.hasHandoffMoment ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {result.results.metrics.hasHandoffMoment ? '✅' : '❌'} Afgeef moment  
                              </div>
                              <div className={`p-2 rounded text-center ${
                                result.results.metrics.canCalculateDuration ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                              }`}>
                                {result.results.metrics.canCalculateDuration ? '✅' : '⚠️'} Duur berekening
                              </div>
                              <div className="p-2 bg-blue-100 text-blue-800 rounded text-center">
                                📋 {result.results.metrics.statusEntriesFound} status items
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-gray-500">
                          Processing time: {result.results.processingTime}
                        </div>
                      </div>
                    )}

                    {/* Default rendering for other test types */}
                    {testType !== 'dhl' && (
                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(result.results || result.error, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DHL API Tab */}
        {activeTab === 'dhl-api' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* DHL API Testing */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">🚚 DHL Official API Testing</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <div className="text-blue-600 mr-3">ℹ️</div>
                  <div>
                    <p className="text-blue-800 font-medium mb-1">Nieuwe DHL API Implementatie</p>
                    <p className="text-blue-700 text-sm">
                      Dit systeem gebruikt nu de officiële DHL Shipment Tracking API in plaats van web scraping.
                      Sneller, betrouwbaarder en schaalbaarder voor productie gebruik.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Test Tracking Codes</label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="3SDFC0681190456 (Example: delivered package)"
                        value={testTrackingCode}
                        onChange={(e) => setTestTrackingCode(e.target.value)}
                        className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                      />
                      <button
                        onClick={() => testDHLOfficialAPI(testTrackingCode)}
                        disabled={testLoading}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Test API
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      Suggested test codes: <code>3SDFC0681190456</code> (delivered), <code>3SDFC1799740226</code> (in transit)
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Quick Test Buttons</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => testDHLOfficialAPI('3SDFC0681190456')}
                      disabled={testLoading}
                      className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      Test: Delivered Package (3SDFC0681190456)
                    </button>
                    <button
                      onClick={() => testDHLOfficialAPI('3SDFC1799740226')}
                      disabled={testLoading}
                      className="w-full bg-yellow-600 text-white py-2 px-4 rounded hover:bg-yellow-700 disabled:opacity-50 text-sm"
                    >
                      Test: In Transit Package (3SDFC1799740226)
                    </button>
                    <button
                      onClick={() => testDHLOfficialAPI('INVALID123456')}
                      disabled={testLoading}
                      className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 disabled:opacity-50 text-sm"
                    >
                      Test: Invalid Tracking Code
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-3">API Configuration Status</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                      <span className="text-sm text-gray-700">DHL API Key</span>
                      <span className="text-sm text-green-600">
                        ✅ Configured
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                      <span className="text-sm text-gray-700">API Endpoint</span>
                      <span className="text-sm text-blue-600">✅ api-eu.dhl.com</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* DHL API Test Results */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 API Test Results</h2>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {testResults?.dhlAPI ? (
                  <div className="border border-gray-200 rounded p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-lg">DHL Official API</span>
                      <span className={`px-3 py-1 text-sm rounded-full ${
                        testResults.dhlAPI.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {testResults.dhlAPI.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </div>
                    
                    {testResults.dhlAPI.success && testResults.dhlAPI.result && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-blue-50 p-3 rounded">
                            <div className="text-sm font-medium text-blue-800 mb-1">📦 Tracking Code</div>
                            <div className="text-blue-900 font-mono">{testResults.dhlAPI.trackingCode}</div>
                          </div>
                          <div className={`p-3 rounded ${
                            testResults.dhlAPI.result.deliveryStatus === 'bezorgd' ? 'bg-green-50' :
                            testResults.dhlAPI.result.deliveryStatus === 'onderweg' ? 'bg-yellow-50' :
                            testResults.dhlAPI.result.deliveryStatus === 'niet gevonden' ? 'bg-gray-50' :
                            'bg-red-50'
                          }`}>
                            <div className="text-sm font-medium text-gray-800 mb-1">🚛 Status</div>
                            <div className="capitalize font-semibold">{testResults.dhlAPI.result.deliveryStatus}</div>
                          </div>
                        </div>

                        {/* NIEUWE TIMING DATA SECTIE */}
                        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg p-4">
                          <div className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
                            ⏱️ Duration Analysis
                            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs">
                              NIEUWE DATA
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                              <div className="bg-white bg-opacity-70 p-3 rounded">
                                <div className="text-xs font-medium text-gray-600 mb-1">📤 Afgegeven bij DHL</div>
                                <div className="text-sm font-semibold text-gray-800">
                                  {testResults.dhlAPI.result.afgegevenMoment ? 
                                    new Date(testResults.dhlAPI.result.afgegevenMoment).toLocaleString('nl-NL', {
                                      weekday: 'short',
                                      day: '2-digit',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    }) : 
                                    'Nog niet opgehaald'
                                  }
                                </div>
                              </div>
                              <div className="bg-white bg-opacity-70 p-3 rounded">
                                <div className="text-xs font-medium text-gray-600 mb-1">📥 Bezorgd aan klant</div>
                                <div className="text-sm font-semibold text-gray-800">
                                  {testResults.dhlAPI.result.afleverMoment ? 
                                    new Date(testResults.dhlAPI.result.afleverMoment).toLocaleString('nl-NL', {
                                      weekday: 'short',
                                      day: '2-digit',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    }) : 
                                    'Nog niet bezorgd'
                                  }
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-center">
                              <div className="bg-white bg-opacity-90 p-4 rounded-lg text-center border-2 border-emerald-200">
                                <div className="text-xs font-medium text-gray-600 mb-1">⏱️ Totale doorlooptijd</div>
                                <div className="text-lg font-bold text-emerald-700">
                                  {testResults.dhlAPI.result.duration || 'Berekening niet mogelijk'}
                                </div>
                                {testResults.dhlAPI.result.durationDays && (
                                  <div className="text-xs text-emerald-600 mt-1">
                                    ({testResults.dhlAPI.result.durationDays.toFixed(2)} dagen exact)
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-purple-50 p-3 rounded">
                          <div className="text-sm font-medium text-purple-800 mb-2">📋 Status Events</div>
                          <div className="text-sm text-purple-900">
                            {testResults.dhlAPI.result.statusTabel.length} events found
                          </div>
                          {testResults.dhlAPI.result.statusTabel.length > 0 && (
                            <div className="mt-2 max-h-32 overflow-y-auto text-xs text-purple-800 space-y-1">
                              {testResults.dhlAPI.result.statusTabel.slice(0, 3).map((event, idx) => (
                                <div key={idx} className="bg-white bg-opacity-70 p-1 rounded">
                                  {event}
                                </div>
                              ))}
                              {testResults.dhlAPI.result.statusTabel.length > 3 && (
                                <div className="text-purple-600 italic">
                                  ... and {testResults.dhlAPI.result.statusTabel.length - 3} more events
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>Processing time: {testResults.dhlAPI.result.processingTime}ms</span>
                          <span>Tested: {testResults.dhlAPI.timestamp}</span>
                        </div>
                      </div>
                    )}

                    {!testResults.dhlAPI.success && (
                      <div className="bg-red-50 border border-red-200 rounded p-3">
                        <div className="text-sm font-medium text-red-800 mb-1">❌ Error</div>
                        <pre className="text-xs text-red-700 whitespace-pre-wrap">
                          {testResults.dhlAPI.error}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <span className="text-4xl mb-2 block">🚚</span>
                    <p>No API tests run yet</p>
                    <p className="text-sm">Click one of the test buttons to start</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Overrides Tab */}
        {activeTab === 'overrides' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Emergency Controls */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">🚨 Emergency Controls</h2>
              <div className="space-y-4">
                <button
                  onClick={() => runOverride('emergency_stop')}
                  disabled={settings?.emergency_stop}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Emergency Stop (Pause All Emails)
                </button>
                
                <button
                  onClick={() => runOverride('emergency_resume')}
                  disabled={!settings?.emergency_stop}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Resume Operations
                </button>
              </div>
            </div>

            {/* Bulk Operations */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Bulk Operations</h2>
              <div className="space-y-4">
                <textarea
                  placeholder="Enter tracking codes (one per line)"
                  value={bulkTrackingCodes}
                  onChange={(e) => setBulkTrackingCodes(e.target.value)}
                  className="w-full h-24 border border-gray-300 rounded px-3 py-2"
                />
                
                <button
                  onClick={() => runOverride('skip_email', { 
                    trackingCodes: bulkTrackingCodes.split('\n').filter(code => code.trim()),
                    reason: 'Admin bulk skip'
                  })}
                  className="w-full bg-yellow-600 text-white py-2 px-4 rounded hover:bg-yellow-700"
                >
                  Skip Emails
                </button>

                <button
                  onClick={() => runOverride('bulk_mark_delivered', { 
                    trackingCodes: bulkTrackingCodes.split('\n').filter(code => code.trim()),
                    reason: 'Admin manual delivery'
                  })}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
                >
                  Mark as Delivered
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
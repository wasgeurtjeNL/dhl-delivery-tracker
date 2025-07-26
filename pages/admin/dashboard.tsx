// pages/admin/dashboard.tsx
import { useState, useEffect } from 'react';
import Head from 'next/head';
import ProgressIndicator, { useProgress } from '../../components/ProgressIndicator';

interface KPIData {
  activeTrackings: number;
  emailsToday: number;
  successRate: number;
  responseRate: number;
}

interface Activity {
  id: string;
  time: string;
  emoji: string;
  description: string;
  type: 'email' | 'customer' | 'error' | 'info';
}

interface DHLInfo {
  afleverMoment: string | null;
  afgegevenMoment: string | null;
  duration: string;
  durationDays: number | undefined;
  deliveryStatus: string;
  statusTabel: string[];
}

interface Tracking {
  id: number;
  trackingCode: string;
  customerName: string;
  email: string;
  dagenOnderweg: number;
  status: string;
  statusColor: string;
  lastAction: string;
  dhlInfo?: DHLInfo | null;
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIData>({
    activeTrackings: 0,
    emailsToday: 0,
    successRate: 0,
    responseRate: 0
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  
  // Progress indicators
  const loadingProgress = useProgress();
  const trackingCheckProgress = useProgress();
  const refreshProgress = useProgress();
  
  // Pausable tracking check state
  const [trackingCheckSession, setTrackingCheckSession] = useState<{
    sessionId: string | null;
    status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed';
    progress?: {
      current: number;
      total: number;
      percentage: number;
      success: number;
      errors: number;
      elapsed: number;
      remaining: number;
    };
  }>({ sessionId: null, status: 'idle' });

  // Data ophalen
  const fetchDashboardData = async (showProgress = false) => {
    if (showProgress) {
      refreshProgress.showProgress({
        mode: 'steps',
        title: 'Dashboard Data Vernieuwen',
        subtitle: 'Bezig met ophalen van de nieuwste gegevens...',
        steps: [
          { id: 'stats', name: 'KPI statistieken ophalen', status: 'pending' },
          { id: 'activity', name: 'Activiteiten ophalen', status: 'pending' },
          { id: 'trackings', name: 'Tracking gegevens ophalen', status: 'pending' }
        ],
        size: 'md'
      });
    }

    try {
      const startTime = Date.now();

      // Stats ophalen
      if (showProgress) refreshProgress.updateStep('stats', { status: 'running' });
      const statsRes = await fetch('/api/dashboard/stats');
      const statsData = await statsRes.json();
      if (showProgress) {
        refreshProgress.updateStep('stats', { 
          status: 'completed', 
          duration: Date.now() - startTime,
          message: `${statsData.kpis.activeTrackings} actieve trackings gevonden`
        });
      }

      // Activity ophalen
      if (showProgress) refreshProgress.updateStep('activity', { status: 'running' });
      const activityRes = await fetch('/api/dashboard/activity?limit=10');
      const activityData = await activityRes.json();
      if (showProgress) {
        refreshProgress.updateStep('activity', { 
          status: 'completed', 
          duration: Date.now() - startTime,
          message: `${activityData.activities.length} activiteiten geladen`
        });
      }

      // Trackings ophalen
      if (showProgress) refreshProgress.updateStep('trackings', { status: 'running' });
      const trackingsRes = await fetch('/api/dashboard/trackings?limit=10&skipDhl=true');
      const trackingsData = await trackingsRes.json();
      if (showProgress) {
        refreshProgress.updateStep('trackings', { 
          status: 'completed', 
          duration: Date.now() - startTime,
          message: `${(trackingsData.trackings || []).length} trackings geladen`
        });
      }

      setKpis(statsData.kpis);
      setActivities(activityData.activities || []);
      setTrackings(trackingsData.trackings || []);
      setLastUpdate(new Date().toLocaleTimeString('nl-NL'));

      // Success delay to show completion
      if (showProgress) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        refreshProgress.hideProgress();
      }
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
      if (showProgress) {
        refreshProgress.updateSteps([
          { id: 'error', name: 'Fout opgetreden', status: 'error', message: 'Kon dashboard gegevens niet ophalen' }
        ]);
        setTimeout(() => refreshProgress.hideProgress(), 3000);
      }
    } finally {
      setLoading(false);
    }
  };

  // Start pausable tracking check
  const startTrackingCheck = async () => {
    try {
      const response = await fetch('/api/tracking/check-pausable?action=start');
      const result = await response.json();
      
      if (result.sessionId) {
        setTrackingCheckSession({
          sessionId: result.sessionId,
          status: 'running'
        });
        
        // Start polling for progress
        pollTrackingProgress(result.sessionId);
        
        trackingCheckProgress.showProgress({
          mode: 'determinate',
          title: 'Tracking Check Uitvoeren',
          subtitle: `0/${result.totalItems} pakketten verwerkt`,
          progress: 0,
          size: 'lg'
        });
      }
    } catch (error) {
      console.error('Error starting tracking check:', error);
    }
  };

  // Pause tracking check
  const pauseTrackingCheck = async () => {
    if (trackingCheckSession.sessionId) {
      try {
        await fetch(`/api/tracking/check-pausable?action=pause&sessionId=${trackingCheckSession.sessionId}`);
        setTrackingCheckSession(prev => ({ ...prev, status: 'paused' }));
      } catch (error) {
        console.error('Error pausing tracking check:', error);
      }
    }
  };

  // Resume tracking check
  const resumeTrackingCheck = async () => {
    if (trackingCheckSession.sessionId) {
      try {
        await fetch(`/api/tracking/check-pausable?action=resume&sessionId=${trackingCheckSession.sessionId}`);
        setTrackingCheckSession(prev => ({ ...prev, status: 'running' }));
        pollTrackingProgress(trackingCheckSession.sessionId);
      } catch (error) {
        console.error('Error resuming tracking check:', error);
      }
    }
  };

  // Stop tracking check
  const stopTrackingCheck = async () => {
    if (trackingCheckSession.sessionId) {
      try {
        const response = await fetch(`/api/tracking/check-pausable?action=stop&sessionId=${trackingCheckSession.sessionId}`);
        const result = await response.json();
        
        setTrackingCheckSession({ sessionId: null, status: 'idle' });
        trackingCheckProgress.hideProgress();
        
        // Refresh dashboard data
        fetchDashboardData();
      } catch (error) {
        console.error('Error stopping tracking check:', error);
      }
    }
  };

  // Poll for tracking progress
  const pollTrackingProgress = async (sessionId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/tracking/check-pausable?action=status&sessionId=${sessionId}`);
        const result = await response.json();
        
        if (result.progress) {
          setTrackingCheckSession(prev => ({
            ...prev,
            progress: result.progress,
            status: result.status
          }));
          
          trackingCheckProgress.showProgress({
            mode: 'determinate',
            title: 'Tracking Check Uitvoeren',
            subtitle: `${result.progress.current}/${result.progress.total} pakketten verwerkt (${result.progress.success} success, ${result.progress.errors} errors)`,
            progress: result.progress.percentage,
            size: 'lg'
          });
        }
        
        // Stop polling als check voltooid is
        if (result.status === 'completed' || result.status === 'stopped') {
          clearInterval(pollInterval);
          setTrackingCheckSession({ sessionId: null, status: 'idle' });
          
          setTimeout(() => {
            trackingCheckProgress.hideProgress();
            fetchDashboardData();
          }, 2000);
        }
        
        // Pause polling als check gepauzeerd is
        if (result.status === 'paused') {
          clearInterval(pollInterval);
        }
        
      } catch (error) {
        clearInterval(pollInterval);
        console.error('Error polling progress:', error);
      }
    }, 1000); // Poll elke seconde
    
    return pollInterval;
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh elke 30 seconden
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Dashboard laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Wasgeurtje.nl - Tracking Dashboard</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📦 Tracking Dashboard</h1>
            <p className="text-gray-600">Laatste update: {lastUpdate}</p>
            
            {/* Progress Status */}
            {trackingCheckSession.status !== 'idle' && trackingCheckSession.progress && (
              <div className="mt-2 flex items-center gap-4 text-sm">
                <span className={`px-2 py-1 rounded text-white ${
                  trackingCheckSession.status === 'running' ? 'bg-blue-600' :
                  trackingCheckSession.status === 'paused' ? 'bg-yellow-600' :
                  trackingCheckSession.status === 'completed' ? 'bg-green-600' : 'bg-gray-600'
                }`}>
                  {trackingCheckSession.status === 'running' ? '🔄 Actief' :
                   trackingCheckSession.status === 'paused' ? '⏸️ Gepauzeerd' :
                   trackingCheckSession.status === 'completed' ? '✅ Voltooid' : 'Onbekend'}
                </span>
                <span className="text-gray-700">
                  {trackingCheckSession.progress.current}/{trackingCheckSession.progress.total} pakketten
                </span>
                <span className="text-green-600">
                  {trackingCheckSession.progress.success} success
                </span>
                <span className="text-red-600">
                  {trackingCheckSession.progress.errors} errors
                </span>
                <span className="text-gray-600">
                  {Math.floor(trackingCheckSession.progress.elapsed / 60)}:{String(trackingCheckSession.progress.elapsed % 60).padStart(2, '0')} verstreken
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <a
              href="/admin/settings"
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              ⚙️ Settings
            </a>
            
            {/* Tracking Check Controls */}
            {trackingCheckSession.status === 'idle' && (
              <button
                onClick={startTrackingCheck}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                🔄 Run Check
              </button>
            )}
            
            {trackingCheckSession.status === 'running' && (
              <>
                <button
                  onClick={pauseTrackingCheck}
                  className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  ⏸️ Pause
                </button>
                <button
                  onClick={stopTrackingCheck}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  ⏹️ Stop
                </button>
              </>
            )}
            
            {trackingCheckSession.status === 'paused' && (
              <>
                <button
                  onClick={resumeTrackingCheck}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  ▶️ Resume
                </button>
                <button
                  onClick={stopTrackingCheck}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  ⏹️ Stop
                </button>
              </>
            )}
            
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={trackingCheckSession.status === 'running'}
              className={`px-4 py-2 rounded-lg transition-colors ${
                trackingCheckSession.status === 'running' 
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <KPICard
            title="Actieve Trackings"
            value={kpis.activeTrackings}
            emoji="📦"
            color="blue"
          />
          <KPICard
            title="Emails Vandaag"
            value={kpis.emailsToday}
            emoji="📧"
            color="green"
          />
          <KPICard
            title="Success Rate"
            value={`${kpis.successRate}%`}
            emoji="✅"
            color="emerald"
          />
          <KPICard
            title="Response Rate"
            value={`${kpis.responseRate}%`}
            emoji="🎯"
            color="purple"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Activity Feed */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                🔴 Live Activity Feed
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {activities.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">📊 Quick Stats</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Pakketten dat vandaag actie nodig heeft:</span>
                  <span className="font-semibold text-orange-600">
                    {(trackings || []).filter(t => t.statusColor === 'orange' || t.statusColor === 'red').length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Klanten die hebben gereageerd:</span>
                  <span className="font-semibold text-green-600">
                    {(trackings || []).filter(t => t.status.includes('gereageerd')).length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Errors laatste 24u:</span>
                  <span className="font-semibold text-red-600">
                    {activities.filter(a => a.type === 'error').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trackings Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">🔍 Actieve Trackings</h2>
            <a
              href="/admin/tracking"
              className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Alle Trackings Bekijken →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tracking Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Klant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dagen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Doorlooptijd
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Laatste Actie
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(trackings || []).map((tracking) => (
                  <tr key={tracking.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      <a 
                        href={`https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${tracking.trackingCode}&submit=1`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {tracking.trackingCode}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{tracking.customerName}</div>
                        <div className="text-sm text-gray-500">{tracking.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tracking.dagenOnderweg}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={tracking.status} color={tracking.statusColor} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {tracking.dhlInfo?.duration || 'Onbekend'}
                      {tracking.dhlInfo?.durationDays && (
                        <div className="text-xs text-gray-500">
                          ({tracking.dhlInfo.durationDays.toFixed(1)} dagen)
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tracking.lastAction}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Progress Indicators */}
      <ProgressIndicator
        isVisible={loadingProgress.isVisible}
        mode={loadingProgress.mode}
        title={loadingProgress.title}
        subtitle={loadingProgress.subtitle}
        steps={loadingProgress.steps}
        variant={loadingProgress.variant}
        progress={loadingProgress.progress}
      />
      
      <ProgressIndicator
        isVisible={trackingCheckProgress.isVisible}
        mode={trackingCheckProgress.mode}
        title={trackingCheckProgress.title}
        subtitle={trackingCheckProgress.subtitle}
        steps={trackingCheckProgress.steps}
        variant={trackingCheckProgress.variant}
        progress={trackingCheckProgress.progress}
      />
      
      <ProgressIndicator
        isVisible={refreshProgress.isVisible}
        mode={refreshProgress.mode}
        title={refreshProgress.title}
        subtitle={refreshProgress.subtitle}
        steps={refreshProgress.steps}
        variant={refreshProgress.variant}
        progress={refreshProgress.progress}
      />
    </div>
  );
}

// Componenten
function KPICard({ title, value, emoji, color }: {
  title: string;
  value: string | number;
  emoji: string;
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200'
  }[color] || 'bg-gray-50 text-gray-600 border-gray-200';

  return (
    <div className={`p-6 rounded-lg border ${colorClasses}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="text-3xl">{emoji}</div>
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const typeStyles = {
    email: 'border-l-blue-400',
    customer: 'border-l-green-400',
    error: 'border-l-red-400',
    info: 'border-l-gray-400'
  };

  return (
    <div className={`border-l-4 pl-4 py-2 ${typeStyles[activity.type]}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg">{activity.emoji}</span>
        <div className="flex-1">
          <p className="text-sm text-gray-900">{activity.description}</p>
          <p className="text-xs text-gray-500">{activity.time}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, color }: { status: string; color: string }) {
  const colorClasses = {
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800'
  }[color] || 'bg-gray-100 text-gray-800';

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClasses}`}>
      {status}
    </span>
  );
} 
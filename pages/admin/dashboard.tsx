// pages/admin/dashboard.tsx
import { useState, useEffect } from 'react';
import Head from 'next/head';
import ProgressIndicator, { useProgress } from '../../components/ProgressIndicator';
import { useAuth } from '../../lib/useAuth';

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
  tijdOnderweg: string;
  status: string;
  statusColor: string;
  lastAction: string;
  dhlInfo?: DHLInfo | null;
}

export default function Dashboard() {
  const { isAuthenticated, loading: authLoading, logout, requireAuth } = useAuth();
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
  
  // State voor uitklapbare secties
  const [isActivityFeedExpanded, setIsActivityFeedExpanded] = useState(false);
  const [isQuickStatsExpanded, setIsQuickStatsExpanded] = useState(false);
  
  // Progress indicators
  const loadingProgress = useProgress();
  const trackingCheckProgress = useProgress();
  const refreshProgress = useProgress();

  // Check authentication
  if (!requireAuth()) {
    return null;
  }
  
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

  if (loading || authLoading) {
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
        <div className="mb-8 bg-gradient-to-r from-white to-gray-50 rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  📦 Tracking Dashboard
                </h1>
                <div className="bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold border border-green-200">
                  ✨ DHL API Enabled
                </div>
              </div>
              <p className="text-gray-600 flex items-center gap-2 mb-3">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Laatste update: {lastUpdate}
              </p>
              
              {/* Progress Status */}
              {trackingCheckSession.status !== 'idle' && trackingCheckSession.progress && (
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-4 text-sm">
                    <span className={`px-3 py-1.5 rounded-full text-white font-semibold shadow-md ${
                      trackingCheckSession.status === 'running' ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                      trackingCheckSession.status === 'paused' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                      trackingCheckSession.status === 'completed' ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gray-600'
                    }`}>
                      {trackingCheckSession.status === 'running' ? '🔄 Actief' :
                       trackingCheckSession.status === 'paused' ? '⏸️ Gepauzeerd' :
                       trackingCheckSession.status === 'completed' ? '✅ Voltooid' : 'Onbekend'}
                    </span>
                    <span className="text-gray-700 font-semibold">
                      {trackingCheckSession.progress.current}/{trackingCheckSession.progress.total} pakketten
                    </span>
                    <span className="text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full">
                      ✅ {trackingCheckSession.progress.success} success
                    </span>
                    <span className="text-red-600 font-semibold bg-red-50 px-2 py-1 rounded-full">
                      ❌ {trackingCheckSession.progress.errors} errors
                    </span>
                    <span className="text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded-full">
                      ⏱️ {Math.floor(trackingCheckSession.progress.elapsed / 60)}:{String(trackingCheckSession.progress.elapsed % 60).padStart(2, '0')}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-3 ml-6">
              <a
                href="/admin/settings"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2.5 rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
              >
                ⚙️ Settings
              </a>
              
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2.5 rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
              >
                🚪 Logout
              </button>
              
              {/* Tracking Check Controls */}
              {trackingCheckSession.status === 'idle' && (
                <button
                  onClick={startTrackingCheck}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2.5 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                >
                  🔄 Run Check
                </button>
              )}
              
              {trackingCheckSession.status === 'running' && (
                <>
                  <button
                    onClick={pauseTrackingCheck}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-4 py-2.5 rounded-xl hover:from-yellow-600 hover:to-yellow-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                  >
                    ⏸️ Pause
                  </button>
                  <button
                    onClick={stopTrackingCheck}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2.5 rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                  >
                    ⏹️ Stop
                  </button>
                </>
              )}
              
              {trackingCheckSession.status === 'paused' && (
                <>
                  <button
                    onClick={resumeTrackingCheck}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2.5 rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                  >
                    ▶️ Resume
                  </button>
                  <button
                    onClick={stopTrackingCheck}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2.5 rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                  >
                    ⏹️ Stop
                  </button>
                </>
              )}
              
              <button
                onClick={() => fetchDashboardData(true)}
                disabled={trackingCheckSession.status === 'running'}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg font-semibold ${
                  trackingCheckSession.status === 'running' 
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-gray-600 hover:to-gray-700 hover:shadow-xl transform hover:-translate-y-0.5'
                }`}
              >
                🔄 Refresh
              </button>
            </div>
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
            <div 
              className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setIsActivityFeedExpanded(!isActivityFeedExpanded)}
            >
              <h2 className="text-xl font-semibold text-gray-900 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  🔴 Live Activity Feed
                </span>
                <span className={`transform transition-transform duration-200 ${isActivityFeedExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </h2>
            </div>
            {isActivityFeedExpanded && (
              <div className="p-6">
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {activities.map((activity) => (
                    <ActivityItem key={activity.id} activity={activity} />
                  ))}
                </div>
              </div>
            )}
            {!isActivityFeedExpanded && (
              <div className="p-4 text-center text-gray-500 text-sm">
                Klik om uit te klappen ({activities.length} activiteiten)
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div 
              className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setIsQuickStatsExpanded(!isQuickStatsExpanded)}
            >
              <h2 className="text-xl font-semibold text-gray-900 flex items-center justify-between">
                <span>📊 Quick Stats</span>
                <span className={`transform transition-transform duration-200 ${isQuickStatsExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </h2>
            </div>
            {isQuickStatsExpanded && (
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
            )}
            {!isQuickStatsExpanded && (
              <div className="p-4 text-center text-gray-500 text-sm">
                Klik om uit te klappen (statistieken)
              </div>
            )}
          </div>
        </div>

        {/* Trackings Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              🔍 Actieve Trackings
              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {(trackings || []).length} items
              </span>
            </h2>
            <a
              href="/admin/tracking"
              className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-lg shadow-sm bg-gradient-to-r from-blue-50 to-blue-100 text-sm font-semibold text-blue-700 hover:from-blue-100 hover:to-blue-200 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Alle Trackings Bekijken →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    🏷️ Tracking Code
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    👤 Klant
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    📅 Dagen
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    📊 Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    ⏱️ Doorlooptijd
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    🔔 Laatste Actie
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {(trackings || []).map((tracking, index) => (
                  <tr 
                    key={tracking.id} 
                    className={`
                      hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 
                      transition-all duration-200 group cursor-pointer
                      ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                    `}
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-400 group-hover:bg-blue-600 transition-colors"></div>
                        <a 
                          href={`https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${tracking.trackingCode}&submit=1`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm font-mono font-semibold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-3 py-1 rounded-lg hover:bg-blue-100 transition-all duration-200"
                        >
                          {tracking.trackingCode}
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-purple-200 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-purple-700">
                            {tracking.customerName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{tracking.customerName}</div>
                          <div className="text-xs text-gray-500 font-medium">{tracking.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`
                          inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
                          ${tracking.dagenOnderweg > 7 
                            ? 'bg-red-100 text-red-700 border border-red-200' 
                            : tracking.dagenOnderweg > 3 
                            ? 'bg-orange-100 text-orange-700 border border-orange-200' 
                            : 'bg-green-100 text-green-700 border border-green-200'
                          }
                        `}>
                          {tracking.tijdOnderweg}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <StatusBadge status={tracking.status} color={tracking.statusColor} />
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <span className="text-blue-600">⏱️</span>
                        <div>
                          <div>{tracking.dhlInfo?.duration || 'Onbekend'}</div>
                          {tracking.dhlInfo?.durationDays && (
                            <div className="text-xs text-gray-500 font-medium">
                              ({tracking.dhlInfo.durationDays.toFixed(1)} dagen exact)
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="text-green-500">🔔</span>
                        <span className="font-medium">{tracking.lastAction}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(trackings || []).length === 0 && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📦</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Geen actieve trackings</h3>
                <p className="text-gray-500">Er zijn momenteel geen trackings om weer te geven.</p>
              </div>
            )}
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
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
      text: 'text-blue-700',
      border: 'border-blue-200',
      shadow: 'shadow-blue-100',
      hover: 'hover:from-blue-100 hover:to-blue-200 hover:shadow-blue-200'
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-green-100',
      text: 'text-green-700',
      border: 'border-green-200',
      shadow: 'shadow-green-100',
      hover: 'hover:from-green-100 hover:to-green-200 hover:shadow-green-200'
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      shadow: 'shadow-emerald-100',
      hover: 'hover:from-emerald-100 hover:to-emerald-200 hover:shadow-emerald-200'
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-50 to-purple-100',
      text: 'text-purple-700',
      border: 'border-purple-200',
      shadow: 'shadow-purple-100',
      hover: 'hover:from-purple-100 hover:to-purple-200 hover:shadow-purple-200'
    }
  }[color] || {
    bg: 'bg-gradient-to-br from-gray-50 to-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-200',
    shadow: 'shadow-gray-100',
    hover: 'hover:from-gray-100 hover:to-gray-200 hover:shadow-gray-200'
  };

  return (
    <div className={`
      p-6 rounded-xl border-2 shadow-lg transition-all duration-300 cursor-pointer group
      ${colorClasses.bg} ${colorClasses.border} ${colorClasses.shadow} ${colorClasses.hover}
      hover:shadow-xl hover:-translate-y-1 transform
    `}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={`text-sm font-semibold ${colorClasses.text} mb-1`}>{title}</p>
          <p className={`text-3xl font-bold ${colorClasses.text} group-hover:scale-105 transition-transform`}>
            {value}
          </p>
        </div>
        <div className="text-4xl group-hover:animate-bounce">
          {emoji}
        </div>
      </div>
      <div className={`mt-3 h-1 rounded-full ${colorClasses.bg.replace('from-', 'from-').replace('to-', 'to-').replace('50', '200').replace('100', '300')}`}></div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const typeStyles = {
    email: {
      border: 'border-l-blue-400',
      bg: 'bg-blue-50/50',
      emoji: '📧',
      color: 'text-blue-700'
    },
    customer: {
      border: 'border-l-green-400',
      bg: 'bg-green-50/50',
      emoji: '👤',
      color: 'text-green-700'
    },
    error: {
      border: 'border-l-red-400',
      bg: 'bg-red-50/50',
      emoji: '⚠️',
      color: 'text-red-700'
    },
    info: {
      border: 'border-l-gray-400',
      bg: 'bg-gray-50/50',
      emoji: 'ℹ️',
      color: 'text-gray-700'
    }
  };

  const style = typeStyles[activity.type];

  return (
    <div className={`
      border-l-4 pl-4 py-3 rounded-r-lg transition-all duration-200 hover:shadow-md group
      ${style.border} ${style.bg} hover:bg-opacity-80
    `}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
          <span className="text-lg">{style.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${style.color} leading-tight`}>
            {activity.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500 font-medium bg-white px-2 py-1 rounded-full">
              {activity.time}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${style.color} bg-white bg-opacity-70`}>
              {activity.type.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, color }: { status: string; color: string }) {
  // Smart status detection en emoji mapping
  const getSmartStatus = (status: string, color: string) => {
    const statusLower = status.toLowerCase();
    
    // Smart status mapping met emojis
    if (statusLower.includes('bezorgd') || statusLower.includes('delivered')) {
      return {
        text: 'Bezorgd',
        emoji: '✅',
        classes: 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200'
      };
    }
    
    if (statusLower.includes('onderweg') || statusLower.includes('transit')) {
      return {
        text: 'Onderweg',
        emoji: '🚛',
        classes: 'bg-gradient-to-r from-blue-100 to-sky-100 text-blue-800 border border-blue-200'
      };
    }
    
    if (statusLower.includes('wacht') || statusLower.includes('not yet received')) {
      return {
        text: 'Wacht op ophaling',
        emoji: '🕐',
        classes: 'bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 border border-orange-200'
      };
    }
    
    if (statusLower.includes('verwerkt') || statusLower.includes('processed')) {
      return {
        text: 'Verwerkt',
        emoji: '📦',
        classes: 'bg-gradient-to-r from-purple-100 to-violet-100 text-purple-800 border border-purple-200'
      };
    }
    
    if (statusLower.includes('fout') || statusLower.includes('error')) {
      return {
        text: 'Fout',
        emoji: '❌',
        classes: 'bg-gradient-to-r from-red-100 to-rose-100 text-red-800 border border-red-200'
      };
    }
    
    // Fallback naar kleur-gebaseerde styling
    const colorClasses = {
      green: 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200',
      blue: 'bg-gradient-to-r from-blue-100 to-sky-100 text-blue-800 border border-blue-200',
      yellow: 'bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border border-yellow-200',
      orange: 'bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 border border-orange-200',
      red: 'bg-gradient-to-r from-red-100 to-rose-100 text-red-800 border border-red-200'
    }[color] || 'bg-gradient-to-r from-gray-100 to-slate-100 text-gray-800 border border-gray-200';
    
    return {
      text: status,
      emoji: '📋',
      classes: colorClasses
    };
  };

  const smartStatus = getSmartStatus(status, color);

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full shadow-sm ${smartStatus.classes}`}>
        <span className="text-sm">{smartStatus.emoji}</span>
        {smartStatus.text}
      </span>
    </div>
  );
} 
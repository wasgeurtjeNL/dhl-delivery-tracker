// pages/admin/tracking.tsx
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../../lib/useAuth';

// Directe Supabase client voor logs
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Interfaces
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
  rowNumber: number;
  trackingCode: string;
  customerName: string;
  email: string;
  orderId: number;
  dagenOnderweg: number;
  status: string;
  statusColor: string;
  lastAction: string;
  verzendDatum: string;
  verzendTime: string;
  isActive: boolean;
  deliveryStatus: string;
  needsAction: boolean;
  logs: any[];
  batchId: string;
  matchedFrom: string;
  lastStatusCheck: string;
  dhlInfo: DHLInfo | null;
}

interface Filters {
  search: string;
  status: string;
  deliveryStatus: string;
  daysMin: number;
  daysMax: number;
  active: boolean;
}

export default function TrackingDashboard() {
  const { isAuthenticated, loading: authLoading, logout, requireAuth } = useAuth();
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    pages: 0,
    showing: 0,
    filteredTotal: 0
  });

  // Check authentication
  if (!requireAuth()) {
    return null;
  }
  const [stats, setStats] = useState<any>(null);
  
  // Filter state
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: '',
    deliveryStatus: '',
    daysMin: 0,
    daysMax: 999,
    active: true
  });
  
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  
  // Selection state for bulk operations
  const [selectedTrackings, setSelectedTrackings] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  
  // Individual scraping state
  const [scrapingTrackings, setScrapingTrackings] = useState<Set<string>>(new Set());
  
  // DHL Refresh Queue State
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [queueProgress, setQueueProgress] = useState({
    total: 0,
    completed: 0,
    current: '',
    failed: 0,
    isRunning: false,
    results: [] as Array<{trackingCode: string, status: 'success' | 'failed', result?: string}>
  });

  // Fetch trackings met filters
  const fetchTrackings = async (page = 1, customFilters?: Partial<Filters>, skipDhl = true) => {
    setLoading(true);
    try {
      const currentFilters = { ...filters, ...customFilters };
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        active: currentFilters.active.toString(),
        search: currentFilters.search,
        status: currentFilters.status,
        deliveryStatus: currentFilters.deliveryStatus,
        daysMin: currentFilters.daysMin.toString(),
        daysMax: currentFilters.daysMax.toString(),
        skipDhl: skipDhl.toString() // OPTIMIZED: Skip DHL scraping by default for fast loading
      });

      const response = await fetch(`/api/dashboard/trackings?${params.toString()}`);
      const data = await response.json();
      
      if (response.ok) {
        setTrackings(data.trackings);
        setPagination(data.pagination);
        setStats(data.stats);
      } else {
        console.error('Failed to fetch trackings:', data.error);
      }
    } catch (error) {
      console.error('Error fetching trackings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackings(pagination.page);
  }, []);

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage })); // Update pagination state directly
    fetchTrackings(newPage, filters, true); // Skip DHL for pagination
  };

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    fetchTrackings(1, updatedFilters, true); // Skip DHL for filter changes
  };

  // Manual refresh function for getting fresh DHL data with queue system
  const refreshWithDHLData = async () => {
    // First get all trackings that need refreshing
    const currentFilters = { ...filters };
    const params = new URLSearchParams({
      page: '1',
      limit: '1000', // Get all trackings for queue
      active: currentFilters.active.toString(),
      search: currentFilters.search,
      status: currentFilters.status,
      deliveryStatus: currentFilters.deliveryStatus,
      daysMin: currentFilters.daysMin.toString(),
      daysMax: currentFilters.daysMax.toString(),
      skipDhl: 'true' // Just get the list first
    });

    try {
      const response = await fetch(`/api/dashboard/trackings?${params.toString()}`);
      const data = await response.json();
      
      if (response.ok && data.trackings) {
                 // Filter trackings that need refreshing (active and not recently scraped)
         const trackingsToRefresh = data.trackings.filter((t: Tracking) => 
           t.isActive && 
           t.deliveryStatus !== 'bezorgd'
           // Note: We'll scrape all active non-delivered trackings for simplicity
         );
        
        if (trackingsToRefresh.length === 0) {
          alert('Geen trackings gevonden die ververst moeten worden.');
          return;
        }
        
        // Start the queue
        await startDHLQueue(trackingsToRefresh);
      }
    } catch (error) {
      console.error('Error starting DHL refresh:', error);
      alert('Fout bij ophalen tracking lijst');
    }
  };

  // Queue system for DHL scraping
  const startDHLQueue = async (trackingsToProcess: Tracking[]) => {
    setQueueProgress({
      total: trackingsToProcess.length,
      completed: 0,
      current: '',
      failed: 0,
      isRunning: true,
      results: []
    });
    setShowProgressModal(true);

    const results: Array<{trackingCode: string, status: 'success' | 'failed', result?: string}> = [];
    
    for (let i = 0; i < trackingsToProcess.length; i++) {
      const tracking = trackingsToProcess[i];
      
      // Update current tracking being processed
      setQueueProgress(prev => ({
        ...prev,
        current: `${tracking.trackingCode} (${tracking.customerName})`
      }));

      try {
        // Call API to scrape this specific tracking
        const response = await fetch('/api/tracking/scrape-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingCode: tracking.trackingCode })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          results.push({
            trackingCode: tracking.trackingCode,
            status: 'success',
            result: result.deliveryStatus || 'Updated'
          });
          
          setQueueProgress(prev => ({
            ...prev,
            completed: prev.completed + 1,
            results: [...results]
          }));
        } else {
          results.push({
            trackingCode: tracking.trackingCode,
            status: 'failed',
            result: result.error || 'Unknown error'
          });
          
          setQueueProgress(prev => ({
            ...prev,
            completed: prev.completed + 1,
            failed: prev.failed + 1,
            results: [...results]
          }));
        }
      } catch (error) {
        results.push({
          trackingCode: tracking.trackingCode,
          status: 'failed',
          result: error instanceof Error ? error.message : 'Network error'
        });
        
        setQueueProgress(prev => ({
          ...prev,
          completed: prev.completed + 1,
          failed: prev.failed + 1,
          results: [...results]
        }));
      }

      // Small delay between requests to avoid overwhelming the system
      if (i < trackingsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Mark as completed
    setQueueProgress(prev => ({
      ...prev,
      current: 'Voltooide!',
      isRunning: false
    }));
    
    // Refresh the main view after completion
    setTimeout(() => {
      fetchTrackings(pagination.page, filters, true);
    }, 1000);
  };

  const closeProgressModal = () => {
    if (!queueProgress.isRunning) {
      setShowProgressModal(false);
      setQueueProgress({
        total: 0,
        completed: 0,
        current: '',
        failed: 0,
        isRunning: false,
        results: []
      });
    }
  };

  const resetFilters = () => {
    const defaultFilters: Filters = {
      search: '',
      status: '',
      deliveryStatus: '',
      daysMin: 0,
      daysMax: 999,
      active: true
    };
    setFilters(defaultFilters);
    fetchTrackings(1, defaultFilters, true); // Skip DHL for reset
  };

  const toggleRowExpansion = (trackingId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(trackingId)) {
      newExpanded.delete(trackingId);
    } else {
      newExpanded.add(trackingId);
    }
    setExpandedRows(newExpanded);
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedTrackings(new Set());
      setSelectAll(false);
    } else {
      const allTrackingCodes = new Set(trackings.map(t => t.trackingCode));
      setSelectedTrackings(allTrackingCodes);
      setSelectAll(true);
    }
  };

  const handleSelectTracking = (trackingCode: string) => {
    const newSelected = new Set(selectedTrackings);
    if (newSelected.has(trackingCode)) {
      newSelected.delete(trackingCode);
    } else {
      newSelected.add(trackingCode);
    }
    setSelectedTrackings(newSelected);
    setSelectAll(newSelected.size === trackings.length);
  };

  // Individual scraping
  const handleIndividualScrape = async (trackingCode: string) => {
    setScrapingTrackings(prev => new Set([...prev, trackingCode]));
    
    try {
      const response = await fetch('/api/tracking/scrape-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingCode })
      });
      
      if (response.ok) {
        // Refresh the data after successful scraping
        await fetchTrackings(pagination.page, filters, true);
      } else {
        const error = await response.json();
        console.error('Scraping failed:', error);
      }
    } catch (error) {
      console.error('Error during individual scrape:', error);
    } finally {
      setScrapingTrackings(prev => {
        const newSet = new Set(prev);
        newSet.delete(trackingCode);
        return newSet;
      });
    }
  };

  // Bulk scraping - using existing single endpoint
  const handleBulkScrape = async () => {
    if (selectedTrackings.size === 0) return;
    
    const trackingCodes = Array.from(selectedTrackings);
    
    // Set up progress tracking
    setQueueProgress({
      total: trackingCodes.length,
      completed: 0,
      current: 'Voorbereiden...',
      failed: 0,
      isRunning: true,
      results: []
    });
    setShowProgressModal(true);

    const results: Array<{trackingCode: string, status: 'success' | 'failed', result?: string}> = [];
    
    // Process each tracking code using the existing single scrape endpoint
    for (let i = 0; i < trackingCodes.length; i++) {
      const trackingCode = trackingCodes[i];
      
      // Update current tracking being processed
      setQueueProgress(prev => ({
        ...prev,
        current: `${trackingCode} (${i + 1}/${trackingCodes.length})`
      }));

      try {
        // Use the existing single scrape endpoint
        const response = await fetch('/api/tracking/scrape-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingCode })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          results.push({
            trackingCode,
            status: 'success',
            result: result.deliveryStatus || 'Updated'
          });
          
          setQueueProgress(prev => ({
            ...prev,
            completed: prev.completed + 1,
            results: [...results]
          }));
        } else {
          results.push({
            trackingCode,
            status: 'failed',
            result: result.error || 'Unknown error'
          });
          
          setQueueProgress(prev => ({
            ...prev,
            completed: prev.completed + 1,
            failed: prev.failed + 1,
            results: [...results]
          }));
        }
      } catch (error) {
        results.push({
          trackingCode,
          status: 'failed',
          result: error instanceof Error ? error.message : 'Network error'
        });
        
        setQueueProgress(prev => ({
          ...prev,
          completed: prev.completed + 1,
          failed: prev.failed + 1,
          results: [...results]
        }));
      }

      // Small delay between requests to avoid overwhelming the system
      if (i < trackingCodes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Mark as completed
    setQueueProgress(prev => ({
      ...prev,
      current: 'Voltooid!',
      isRunning: false
    }));
    
    // Clear selection and refresh data
    setSelectedTrackings(new Set());
    setSelectAll(false);
    setTimeout(() => {
      fetchTrackings(pagination.page, filters, true);
    }, 1000);
  };

  const StatusBadge = ({ status, color }: { status: string; color: string }) => {
    const colorClasses = {
      green: 'bg-green-100 text-green-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      orange: 'bg-orange-100 text-orange-800',
      red: 'bg-red-100 text-red-800',
      blue: 'bg-blue-100 text-blue-800',
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClasses[color as keyof typeof colorClasses] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Tracking Dashboard - Wasgeurtje.nl</title>
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
          <h1 className="text-3xl font-bold text-gray-900">📦 Tracking Dashboard</h1>
          <p className="text-gray-600">Overzicht van alle tracking records met zoek en filter mogelijkheden</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Totaal Records</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalRecords}</p>
                </div>
                <div className="p-3 rounded-full bg-gray-100">
                  <span className="text-gray-600 text-xl">📦</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Actief</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.statusBreakdown?.actief || 0}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-100">
                  <span className="text-blue-600 text-xl">🔄</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Actie Nodig</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.needsAction}</p>
                </div>
                <div className="p-3 rounded-full bg-orange-100">
                  <span className="text-orange-600 text-xl">⚠️</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Bezorgd</p>
                  <p className="text-2xl font-bold text-green-600">{stats.statusBreakdown?.bezorgd || 0}</p>
                </div>
                <div className="p-3 rounded-full bg-green-100">
                  <span className="text-green-600 text-xl">✅</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Errors</p>
                  <p className="text-2xl font-bold text-red-600">{stats.statusBreakdown?.errors || 0}</p>
                </div>
                <div className="p-3 rounded-full bg-red-100">
                  <span className="text-red-600 text-xl">❌</span>
                </div>
              </div>
            </div>

            {/* Duration Stats Cards */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Gem. Doorlooptijd</p>
                  <p className="text-xl font-bold text-purple-600">
                    {stats.durationStats?.avgDurationFormatted || 'Geen data'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stats.durationStats?.trackingsWithDuration || 0} met data
                  </p>
                </div>
                <div className="p-3 rounded-full bg-purple-100">
                  <span className="text-purple-600 text-xl">⏱️</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Gem. Bezorgd</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {stats.durationStats?.avgCompletedDurationFormatted || 'Geen data'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stats.durationStats?.completedTrackings || 0} voltooid
                  </p>
                </div>
                <div className="p-3 rounded-full bg-emerald-100">
                  <span className="text-emerald-600 text-xl">🚀</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-blue-600 text-lg">ℹ️</span>
            <div>
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Performance Optimalisatie</h3>
              <p className="text-sm text-blue-800">
                Deze pagina toont <strong>cached data</strong> voor snelle weergave. 
                Gebruik <strong>"🚛 DHL Refresh"</strong> om actuele tracking data op te halen (kan 1-2 minuten duren).
                Bezorgde pakketten worden automatisch uitgesloten van nieuwe scraping.
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 mb-4">
            {/* Search */}
            <div className="flex-1">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                🔍 Zoeken
              </label>
              <input
                type="text"
                id="search"
                placeholder="Zoek op email, tracking code, order ID, naam..."
                value={filters.search}
                onChange={(e) => handleFilterChange({ search: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={filters.active ? 'true' : 'false'}
                  onChange={(e) => handleFilterChange({ active: e.target.value === 'true' })}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="true">Alleen Actief</option>
                  <option value="false">Alle Records</option>
                </select>
              </div>

              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                {showAdvancedFilters ? '🔼 Minder filters' : '🔽 Meer filters'}
              </button>

              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
              >
                🗑️ Reset
              </button>
              
                             <button
                 onClick={refreshWithDHLData}
                 disabled={loading || authLoading || queueProgress.isRunning}
                 className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                 title="Ververs alle DHL tracking data (wordt 1 voor 1 afgehandeld)"
               >
                 {loading || authLoading || queueProgress.isRunning ? '🔄' : '🚛'} DHL Refresh
               </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Status</label>
                <select
                  value={filters.deliveryStatus}
                  onChange={(e) => handleFilterChange({ deliveryStatus: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Alle statussen</option>
                  <option value="onderweg">Onderweg</option>
                  <option value="bezorgd">Bezorgd</option>
                  <option value="fout">Fout</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Action Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange({ status: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Alle statussen</option>
                  <option value="OK">OK</option>
                  <option value="actie nodig">Actie nodig</option>
                  <option value="gemonitord">Gemonitord</option>
                  <option value="wacht">Wacht op reactie</option>
                  <option value="afgehandeld">Afgehandeld</option>
                  <option value="fout">Fout</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min. dagen onderweg</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={filters.daysMin}
                  onChange={(e) => handleFilterChange({ daysMin: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max. dagen onderweg</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={filters.daysMax}
                  onChange={(e) => handleFilterChange({ daysMax: parseInt(e.target.value) || 999 })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedTrackings.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-blue-700 font-medium">
                  {selectedTrackings.size} tracking{selectedTrackings.size > 1 ? 's' : ''} geselecteerd
                </span>
                <button
                  onClick={() => {
                    setSelectedTrackings(new Set());
                    setSelectAll(false);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Selectie wissen
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkScrape}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
                >
                  🔄 Bulk Scrapen ({selectedTrackings.size})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trackings Table */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="sr-only">Expand</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Klant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dagen</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doorlooptijd</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verzonden</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acties</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading || authLoading ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-4 text-center text-gray-500">
                      🔄 Laden...
                    </td>
                  </tr>
                ) : trackings.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-4 text-center text-gray-500">
                      Geen trackings gevonden met de huidige filters.
                    </td>
                  </tr>
                ) : (
                  trackings.map((tracking) => (
                    <>
                      <tr key={tracking.id} className={tracking.needsAction ? 'bg-red-50' : ''}>
                        {/* Selection Checkbox */}
                        <td className="px-2 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedTrackings.has(tracking.trackingCode)}
                            onChange={() => handleSelectTracking(tracking.trackingCode)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </td>
                        
                        {/* Expand/Collapse Button */}
                        <td className="px-2 py-4 whitespace-nowrap">
                          <button
                            onClick={() => toggleRowExpansion(tracking.id)}
                            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                            disabled={!tracking.dhlInfo}
                          >
                            {tracking.dhlInfo ? (
                              expandedRows.has(tracking.id) ? (
                                <span className="text-sm">📋</span>
                              ) : (
                                <span className="text-sm">📦</span>
                              )
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </button>
                        </td>
                        
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {tracking.rowNumber}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <a 
                            href={`https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${tracking.trackingCode}&submit=1`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {tracking.trackingCode}
                          </a>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{tracking.customerName}</div>
                          <div className="text-sm text-gray-500">{tracking.email}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {tracking.orderId}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            tracking.dagenOnderweg >= 10 ? 'bg-red-100 text-red-800' :
                            tracking.dagenOnderweg >= 5 ? 'bg-orange-100 text-orange-800' :
                            tracking.dagenOnderweg >= 3 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {tracking.dagenOnderweg} dagen
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <StatusBadge status={tracking.status} color={tracking.statusColor} />
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            tracking.deliveryStatus === 'bezorgd' ? 'bg-green-100 text-green-800' :
                            tracking.deliveryStatus === 'fout' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {tracking.deliveryStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                          {tracking.dhlInfo?.duration || 'Onbekend'}
                          {tracking.dhlInfo?.durationDays && (
                            <div className="text-xs text-gray-500">
                              ({tracking.dhlInfo.durationDays.toFixed(2)} dagen)
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{tracking.verzendDatum}</div>
                          <div className="text-xs text-gray-400">{tracking.verzendTime}</div>
                        </td>
                        
                        {/* Actions Column */}
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button
                            onClick={() => handleIndividualScrape(tracking.trackingCode)}
                            disabled={scrapingTrackings.has(tracking.trackingCode)}
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              scrapingTrackings.has(tracking.trackingCode)
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}
                          >
                            {scrapingTrackings.has(tracking.trackingCode) ? (
                              <>🔄 Bezig...</>
                            ) : (
                              <>🔄 Scrape</>
                            )}
                          </button>
                        </td>
                      </tr>
                      
                      {/* Expanded Row with DHL Details */}
                      {expandedRows.has(tracking.id) && tracking.dhlInfo && (
                        <tr className="bg-gray-50">
                          <td colSpan={12} className="px-4 py-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* DHL Timeline Info */}
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  🚛 DHL Tracking Details
                                </h4>
                                <div className="space-y-3">
                                  {tracking.dhlInfo.afgegevenMoment && (
                                    <div className="flex items-start gap-3">
                                      <span className="text-lg">📦</span>
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">Afgegeven bij DHL</div>
                                        <div className="text-sm text-gray-600">{tracking.dhlInfo.afgegevenMoment}</div>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {tracking.dhlInfo.afleverMoment && (
                                    <div className="flex items-start gap-3">
                                      <span className="text-lg">📬</span>
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">Bezorgd aan klant</div>
                                        <div className="text-sm text-gray-600">{tracking.dhlInfo.afleverMoment}</div>
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div className="flex items-start gap-3">
                                    <span className="text-lg">🕐</span>
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">Totale doorlooptijd</div>
                                      <div className="text-sm text-gray-600">{tracking.dhlInfo.duration}</div>
                                      {tracking.dhlInfo.durationDays && (
                                        <div className="text-xs text-gray-500">
                                          ({tracking.dhlInfo.durationDays.toFixed(2)} dagen)
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Status Geschiedenis */}
                              {tracking.dhlInfo.statusTabel && tracking.dhlInfo.statusTabel.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    📋 Status Geschiedenis
                                  </h4>
                                  <div className="max-h-40 overflow-y-auto">
                                    <div className="space-y-2">
                                      {tracking.dhlInfo.statusTabel.slice(0, 5).map((status, index) => (
                                        <div key={index} className="text-sm text-gray-600 p-2 bg-white rounded border-l-2 border-blue-200">
                                          {status}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && !authLoading && trackings.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Vorige
                </button>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Volgende
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Toon <span className="font-medium">{((pagination.page - 1) * pagination.limit) + 1}</span> tot{' '}
                    <span className="font-medium">{Math.min(pagination.page * pagination.limit, pagination.filteredTotal || pagination.total)}</span> van{' '}
                    <span className="font-medium">{pagination.filteredTotal || pagination.total}</span> resultaten
                    {pagination.filteredTotal && pagination.filteredTotal !== pagination.total && (
                      <span className="text-gray-500"> (gefilterd van {pagination.total})</span>
                    )}
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      ← Vorige
                    </button>
                    
                    {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                            pageNum === pagination.page
                              ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                              : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.pages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      Volgende →
                    </button>
                  </nav>
                </div>
              </div>
            </div>
                     )}
         </div>

         {/* DHL Progress Modal */}
         {showProgressModal && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
             <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
               {/* Header */}
               <div className="flex items-center justify-between p-6 border-b border-gray-200">
                 <div className="flex items-center gap-3">
                   <span className="text-2xl">🚛</span>
                   <div>
                     <h3 className="text-lg font-semibold text-gray-900">DHL Tracking Refresh</h3>
                     <p className="text-sm text-gray-600">
                       {queueProgress.completed} van {queueProgress.total} voltooid
                       {queueProgress.failed > 0 && ` • ${queueProgress.failed} gefaald`}
                     </p>
                   </div>
                 </div>
                 <button
                   onClick={closeProgressModal}
                   disabled={queueProgress.isRunning}
                   className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   ✕
                 </button>
               </div>

               {/* Progress Bar */}
               <div className="p-6 border-b border-gray-200">
                 <div className="flex items-center justify-between mb-2">
                   <span className="text-sm font-medium text-gray-700">Voortgang</span>
                   <span className="text-sm text-gray-500">
                     {Math.round((queueProgress.completed / queueProgress.total) * 100)}%
                   </span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-2">
                   <div 
                     className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                     style={{ width: `${(queueProgress.completed / queueProgress.total) * 100}%` }}
                   ></div>
                 </div>
                 
                 {queueProgress.current && (
                   <div className="mt-3 flex items-center gap-2">
                     <span className="text-sm text-gray-600">Huidige:</span>
                     <span className="text-sm font-medium text-gray-900">
                       {queueProgress.isRunning ? (
                         <span className="flex items-center gap-2">
                           <span className="animate-spin">⏳</span>
                           {queueProgress.current}
                         </span>
                       ) : (
                         queueProgress.current
                       )}
                     </span>
                   </div>
                 )}
               </div>

               {/* Results List */}
               <div className="p-6 max-h-96 overflow-y-auto">
                 <h4 className="text-sm font-semibold text-gray-900 mb-3">Resultaten</h4>
                 <div className="space-y-2">
                   {queueProgress.results.map((result, index) => (
                     <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                       <div className="flex items-center gap-3">
                         <span className={`text-lg ${result.status === 'success' ? '✅' : '❌'}`}>
                           {result.status === 'success' ? '✅' : '❌'}
                         </span>
                         <span className="text-sm font-medium text-gray-900">
                           {result.trackingCode}
                         </span>
                       </div>
                       <span className={`text-sm px-2 py-1 rounded-full ${
                         result.status === 'success' 
                           ? 'bg-green-100 text-green-800' 
                           : 'bg-red-100 text-red-800'
                       }`}>
                         {result.result}
                       </span>
                     </div>
                   ))}
                   
                   {queueProgress.results.length === 0 && (
                     <div className="text-center text-gray-500 py-4">
                       <span className="text-lg">⏳</span>
                       <p className="text-sm mt-2">Wachten op resultaten...</p>
                     </div>
                   )}
                 </div>
               </div>

               {/* Footer */}
               <div className="flex items-center justify-between p-6 bg-gray-50 border-t border-gray-200">
                 <div className="text-sm text-gray-600">
                   {queueProgress.isRunning ? (
                     <span className="flex items-center gap-2">
                       <span className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></span>
                       Bezig met verwerken...
                     </span>
                   ) : (
                     <span className="flex items-center gap-2">
                       <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                       Klaar! Pagina wordt automatisch ververst.
                     </span>
                   )}
                 </div>
                 
                 {!queueProgress.isRunning && (
                   <button
                     onClick={closeProgressModal}
                     className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                   >
                     Sluiten
                   </button>
                 )}
               </div>
             </div>
           </div>
         )}
       </div>
     </div>
   );
 }

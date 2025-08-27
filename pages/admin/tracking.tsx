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
  batchId?: string;
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
  
  // Enhanced search features
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [savedSearches, setSavedSearches] = useState<Array<{name: string, filters: Filters}>>([]);
  
  // Additional filter states
  const [dateFilters, setDateFilters] = useState({
    shipDateFrom: '',
    shipDateTo: '',
    deliveryDateFrom: '',
    deliveryDateTo: '',
    lastActionFrom: '',
    lastActionTo: ''
  });
  
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDateFilters, setShowDateFilters] = useState(false);
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
        batchId: currentFilters.batchId || '',
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

  // Debounced search effect - ONLY for search term changes
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.length >= 2 || searchTerm.length === 0) {
        // Only trigger search if search term actually changed from current filters
        if (searchTerm !== filters.search) {
          setFilters(prev => ({ ...prev, search: searchTerm }));
          fetchTrackings(1, { ...filters, search: searchTerm }, true);
          
          // Add to search history when search is executed
          if (searchTerm.length >= 2) {
            addToSearchHistory(searchTerm);
          }
        }
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Sync searchTerm with filters.search when changed externally (saved searches, etc.)
  useEffect(() => {
    if (filters.search !== searchTerm) {
      setSearchTerm(filters.search);
    }
  }, [filters.search]);

  useEffect(() => {
    fetchTrackings(pagination.page);
    
    // Load saved searches and history from localStorage
    const saved = localStorage.getItem('tracking-saved-searches');
    const history = localStorage.getItem('tracking-search-history');
    
    if (saved) {
      try {
        setSavedSearches(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading saved searches:', error);
      }
    }
    
    if (history) {
      try {
        setSearchHistory(JSON.parse(history));
      } catch (error) {
        console.error('Error loading search history:', error);
      }
    }
  }, []);

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage })); // Update pagination state directly
    fetchTrackings(newPage, filters, true); // Skip DHL for pagination
  };

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    
    // Always trigger search for non-search filter changes
    if (!newFilters.hasOwnProperty('search')) {
      fetchTrackings(1, updatedFilters, true); // Skip DHL for filter changes
    } else {
      // For search changes, also update searchTerm to keep them in sync
      if (newFilters.search !== undefined) {
        setSearchTerm(newFilters.search);
      }
    }
  };

  // Enhanced search functionality
  const handleSearchChange = (value: string) => {
    setSearchTerm(value); // Use the new searchTerm state instead
    
    // Generate suggestions based on search history and current data
    if (value.length >= 1) {
      const suggestions = searchHistory
        .filter(term => term.toLowerCase().includes(value.toLowerCase()) && term !== value)
        .slice(0, 5);
      
      // Add common patterns
      if (value.match(/^\d+$/)) {
        suggestions.unshift(`Order ${value}*`);
      }
      if (value.match(/^[A-Z0-9]+$/i)) {
        suggestions.unshift(`Tracking ${value}*`);
      }
      
      setSearchSuggestions(suggestions);
      setShowSearchSuggestions(suggestions.length > 0);
    } else {
      setShowSearchSuggestions(false);
    }
  };

  const selectSearchSuggestion = (suggestion: string) => {
    const cleanSuggestion = suggestion.replace(/^(Order|Tracking)\s/, '').replace(/\*$/, '');
    setSearchTerm(cleanSuggestion);
    setFilters(prev => ({ ...prev, search: cleanSuggestion }));
    setShowSearchSuggestions(false);
    
    // Add to search history
    addToSearchHistory(cleanSuggestion);
  };

  const addToSearchHistory = (searchTerm: string) => {
    if (searchTerm.trim() && !searchHistory.includes(searchTerm)) {
      const newHistory = [searchTerm, ...searchHistory.slice(0, 9)]; // Keep last 10
      setSearchHistory(newHistory);
      localStorage.setItem('tracking-search-history', JSON.stringify(newHistory));
    }
  };

  // Quick filter presets - UPDATED for database compatibility
  const applyQuickFilter = (preset: string) => {
    let newFilters: Partial<Filters> = {};
    
    switch (preset) {
      case 'problem-packages':
        // Packages that might have issues (long transit + active)
        newFilters = {
          active: true,
          daysMin: 7,
          daysMax: 999,
          deliveryStatus: 'onderweg'
        };
        break;
      case 'recent-deliveries':
        // Recently delivered packages
        newFilters = {
          deliveryStatus: 'bezorgd',
          active: false,
          daysMin: 0,
          daysMax: 7
        };
        break;
      case 'long-transit':
        // Packages taking too long
        newFilters = {
          active: true,
          daysMin: 10,
          daysMax: 999,
          deliveryStatus: 'onderweg'
        };
        break;
      case 'awaiting-pickup':
        // Packages waiting for DHL pickup
        newFilters = {
          active: true,
          deliveryStatus: 'verwerkt',
          daysMin: 2,
          daysMax: 999
        };
        break;
      case 'not-found':
        // Tracking codes not found
        newFilters = {
          deliveryStatus: 'niet gevonden',
          active: true
        };
        break;
      case 'fresh-packages':
        // Recently shipped packages
        newFilters = {
          active: true,
          daysMin: 0,
          daysMax: 3,
          deliveryStatus: 'onderweg'
        };
        break;
      default:
        return;
    }
    
    const updatedFilters = { ...filters, ...newFilters };
    
    // Clear search term if it's not being explicitly set
    if (!newFilters.hasOwnProperty('search')) {
      setSearchTerm('');
      updatedFilters.search = '';
    }
    
    setFilters(updatedFilters);
    fetchTrackings(1, updatedFilters, true);
  };

  // Save search functionality
  const saveCurrentSearch = () => {
    const name = prompt('Geef een naam voor deze zoekactie:');
    if (name && name.trim()) {
      const newSavedSearch = { name: name.trim(), filters: { ...filters } };
      const updated = [...savedSearches, newSavedSearch];
      setSavedSearches(updated);
      localStorage.setItem('tracking-saved-searches', JSON.stringify(updated));
    }
  };

  const loadSavedSearch = (savedSearch: {name: string, filters: Filters}) => {
    setFilters(savedSearch.filters);
    fetchTrackings(1, savedSearch.filters, true);
  };

  const deleteSavedSearch = (index: number) => {
    const updated = savedSearches.filter((_, i) => i !== index);
    setSavedSearches(updated);
    localStorage.setItem('tracking-saved-searches', JSON.stringify(updated));
  };

  // Export functionality
  const exportToCSV = () => {
    const headers = [
      'Tracking Code',
      'Klant Naam',
      'Email',
      'Order ID',
      'Dagen Onderweg',
      'Status',
      'Delivery Status',
      'Doorlooptijd',
      'Verzend Datum',
      'Last Action',
      'Batch ID'
    ];

    const csvData = trackings.map(tracking => [
      tracking.trackingCode,
      tracking.customerName,
      tracking.email,
      tracking.orderId,
      tracking.dagenOnderweg,
      tracking.status,
      tracking.deliveryStatus,
      tracking.dhlInfo?.duration || 'Onbekend',
      tracking.verzendDatum,
      tracking.lastAction,
      tracking.batchId
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tracking-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Enhanced tracking code filter with pattern matching
  const handleTrackingCodeFilter = (pattern: string) => {
    let searchPattern = pattern;
    
    // Support wildcards
    if (pattern.includes('*')) {
      searchPattern = pattern.replace(/\*/g, '');
    }
    
    // Support partial matching for tracking codes
    if (pattern.match(/^[A-Z0-9]{2,}$/i)) {
      searchPattern = pattern;
    }
    
    setFilters(prev => ({ ...prev, search: searchPattern }));
  };

  // Bulk operations
  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedTrackings.size === 0) return;
    
    const confirmed = confirm(`Weet je zeker dat je de status van ${selectedTrackings.size} tracking(s) wilt wijzigen naar "${newStatus}"?`);
    if (!confirmed) return;

    try {
      const trackingCodes = Array.from(selectedTrackings);
      const response = await fetch('/api/admin/bulk-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingCodes, status: newStatus })
      });
      
      if (response.ok) {
        alert('Status succesvol bijgewerkt!');
        setSelectedTrackings(new Set());
        setSelectAll(false);
        fetchTrackings(pagination.page, filters, true);
      } else {
        alert('Fout bij het bijwerken van de status');
      }
    } catch (error) {
      console.error('Error updating bulk status:', error);
      alert('Fout bij het bijwerken van de status');
    }
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
    setSearchTerm(''); // Reset search term too
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

        {/* Enhanced Search and Filter Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          {/* Quick Filter Presets */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">🚀 Snelle Filters</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => applyQuickFilter('problem-packages')}
                className="px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm"
              >
                🚨 Probleem Pakketten (7+ dagen)
              </button>
              <button
                onClick={() => applyQuickFilter('long-transit')}
                className="px-3 py-1 bg-orange-100 text-orange-700 rounded-md hover:bg-orange-200 transition-colors text-sm"
              >
                🐌 Lange Transit (10+ dagen)
              </button>
              <button
                onClick={() => applyQuickFilter('awaiting-pickup')}
                className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors text-sm"
              >
                📦 Wacht op Ophaling
              </button>
              <button
                onClick={() => applyQuickFilter('not-found')}
                className="px-3 py-1 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors text-sm"
              >
                ❓ Niet Gevonden
              </button>
              <button
                onClick={() => applyQuickFilter('fresh-packages')}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm"
              >
                🆕 Vers Verzonden (0-3 dagen)
              </button>
              <button
                onClick={() => applyQuickFilter('recent-deliveries')}
                className="px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors text-sm"
              >
                ✅ Recent Bezorgd
              </button>
            </div>
          </div>

          {/* Saved Searches */}
          {savedSearches.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">💾 Opgeslagen Zoekopdrachten</h3>
              <div className="flex flex-wrap gap-2">
                {savedSearches.map((saved, index) => (
                  <div key={index} className="flex items-center gap-1 bg-purple-100 rounded-md">
                    <button
                      onClick={() => loadSavedSearch(saved)}
                      className="px-3 py-1 text-purple-700 hover:bg-purple-200 transition-colors text-sm rounded-l-md"
                    >
                      {saved.name}
                    </button>
                    <button
                      onClick={() => deleteSavedSearch(index)}
                      className="px-2 py-1 text-purple-500 hover:text-purple-700 text-sm"
                      title="Verwijder opgeslagen zoekopdracht"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4 mb-4">
            {/* Enhanced Search with Suggestions */}
            <div className="flex-1 relative">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                🔍 Geavanceerd Zoeken
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="search"
                  placeholder="Zoek op email, tracking code, order ID, naam... (gebruik * voor wildcards)"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => {
                    if (searchSuggestions.length > 0) setShowSearchSuggestions(true);
                  }}
                  onBlur={() => {
                    // Delay to allow suggestion click
                    setTimeout(() => setShowSearchSuggestions(false), 200);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Trigger search immediately on Enter
                      setFilters(prev => ({ ...prev, search: searchTerm }));
                      fetchTrackings(1, { ...filters, search: searchTerm }, true);
                      if (searchTerm.length >= 2) {
                        addToSearchHistory(searchTerm);
                      }
                    }
                  }}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-10"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilters(prev => ({ ...prev, search: '' }));
                      setShowSearchSuggestions(false);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
                
                {/* Search Suggestions Dropdown */}
                {showSearchSuggestions && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-10 mt-1">
                    {searchSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => selectSearchSuggestion(suggestion)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 first:rounded-t-md last:rounded-b-md text-sm"
                      >
                        {suggestion.includes('*') ? (
                          <span className="text-blue-600">📋 {suggestion}</span>
                        ) : (
                          <span className="text-gray-700">🔍 {suggestion}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
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
                onClick={saveCurrentSearch}
                className="px-4 py-2 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors"
                title="Huidige zoekopdracht opslaan"
              >
                💾 Opslaan
              </button>

              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                {showAdvancedFilters ? '🔼 Minder filters' : '🔽 Meer filters'}
              </button>

              <button
                onClick={() => setShowDateFilters(!showDateFilters)}
                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition-colors"
              >
                📅 Datum filters
              </button>

              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
                title="Exporteer huidige resultaten naar CSV"
              >
                📊 Export CSV
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
            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-4">🔧 Geavanceerde Filters</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Status</label>
                  <select
                    value={filters.deliveryStatus}
                    onChange={(e) => handleFilterChange({ deliveryStatus: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Alle statussen</option>
                    <option value="onderweg">🚛 Onderweg</option>
                    <option value="bezorgd">✅ Bezorgd</option>
                    <option value="verwerkt">📦 Verwerkt (wacht op ophaling)</option>
                    <option value="niet gevonden">❌ Niet gevonden</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Batch ID</label>
                  <input
                    type="text"
                    placeholder="Filter op batch ID..."
                    value={filters.batchId || ''}
                    onChange={(e) => handleFilterChange({ batchId: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
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
            </div>
          )}

          {/* Date Filters */}
          {showDateFilters && (
            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-4">📅 Datum Filters</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-gray-600">Verzend Datum</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Van</label>
                      <input
                        type="date"
                        value={dateFilters.shipDateFrom}
                        onChange={(e) => setDateFilters(prev => ({ ...prev, shipDateFrom: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tot</label>
                      <input
                        type="date"
                        value={dateFilters.shipDateTo}
                        onChange={(e) => setDateFilters(prev => ({ ...prev, shipDateTo: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-gray-600">Bezorg Datum</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Van</label>
                      <input
                        type="date"
                        value={dateFilters.deliveryDateFrom}
                        onChange={(e) => setDateFilters(prev => ({ ...prev, deliveryDateFrom: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tot</label>
                      <input
                        type="date"
                        value={dateFilters.deliveryDateTo}
                        onChange={(e) => setDateFilters(prev => ({ ...prev, deliveryDateTo: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-gray-600">Laatste Actie</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Van</label>
                      <input
                        type="date"
                        value={dateFilters.lastActionFrom}
                        onChange={(e) => setDateFilters(prev => ({ ...prev, lastActionFrom: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tot</label>
                      <input
                        type="date"
                        value={dateFilters.lastActionTo}
                        onChange={(e) => setDateFilters(prev => ({ ...prev, lastActionTo: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    // Apply date filters by updating current filters
                    const dateParams = new URLSearchParams();
                    if (dateFilters.shipDateFrom) dateParams.set('shipDateFrom', dateFilters.shipDateFrom);
                    if (dateFilters.shipDateTo) dateParams.set('shipDateTo', dateFilters.shipDateTo);
                    if (dateFilters.deliveryDateFrom) dateParams.set('deliveryDateFrom', dateFilters.deliveryDateFrom);
                    if (dateFilters.deliveryDateTo) dateParams.set('deliveryDateTo', dateFilters.deliveryDateTo);
                    if (dateFilters.lastActionFrom) dateParams.set('lastActionFrom', dateFilters.lastActionFrom);
                    if (dateFilters.lastActionTo) dateParams.set('lastActionTo', dateFilters.lastActionTo);
                    
                    // Note: For simplicity, we'll trigger a search - in production you'd extend the API
                    fetchTrackings(1, filters, true);
                    alert('Datum filters toegepast! (Opmerking: volledige datum filter implementatie vereist API uitbreiding)');
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm"
                >
                  Toepassen
                </button>
                <button
                  onClick={() => {
                    setDateFilters({
                      shipDateFrom: '',
                      shipDateTo: '',
                      deliveryDateFrom: '',
                      deliveryDateTo: '',
                      lastActionFrom: '',
                      lastActionTo: ''
                    });
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Bulk Actions */}
        {selectedTrackings.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex flex-col gap-3">
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
                    onClick={exportToCSV}
                    className="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 flex items-center gap-1 text-sm"
                  >
                    📊 Export Selectie
                  </button>
                </div>
              </div>

              {/* Bulk Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleBulkScrape}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
                >
                  🔄 Bulk Scrapen ({selectedTrackings.size})
                </button>
                
                <div className="relative group">
                  <button className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 flex items-center gap-2">
                    📧 Bulk Email
                  </button>
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        // Implement bulk heads up email
                        console.log('Sending bulk heads up emails to:', Array.from(selectedTrackings));
                      }}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700"
                    >
                      📤 Heads Up Email
                    </button>
                    <button
                      onClick={() => {
                        // Implement bulk choice email
                        console.log('Sending bulk choice emails to:', Array.from(selectedTrackings));
                      }}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700"
                    >
                      🤔 Keuze Email
                    </button>
                  </div>
                </div>

                <div className="relative group">
                  <button className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 flex items-center gap-2">
                    🏷️ Status Update
                  </button>
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleBulkStatusUpdate('gemonitord')}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700"
                    >
                      👁️ Gemonitord
                    </button>
                    <button
                      onClick={() => handleBulkStatusUpdate('actie nodig')}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700"
                    >
                      ⚠️ Actie Nodig
                    </button>
                    <button
                      onClick={() => handleBulkStatusUpdate('afgehandeld')}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700"
                    >
                      ✅ Afgehandeld
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    // Implement bulk deactivate
                    const confirmed = confirm(`Weet je zeker dat je ${selectedTrackings.size} tracking(s) wilt deactiveren?`);
                    if (confirmed) {
                      console.log('Deactivating trackings:', Array.from(selectedTrackings));
                      // Implement API call
                    }
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center gap-2"
                >
                  🚫 Deactiveren
                </button>

                <button
                  onClick={() => {
                    // Implement bulk add to batch
                    const batchName = prompt('Voer batch naam in:');
                    if (batchName) {
                      console.log('Adding to batch:', batchName, Array.from(selectedTrackings));
                      // Implement API call
                    }
                  }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center gap-2"
                >
                  📦 Toevoegen aan Batch
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
                      <div className="py-8">
                        <span className="text-4xl mb-4 block">📦</span>
                        <p className="text-lg font-medium mb-2">Geen trackings gevonden</p>
                        <p className="text-sm">
                          Probeer de filters aan te passen of een andere zoekterm te gebruiken.
                          {filters.daysMin >= 10 && (
                            <span className="block mt-2 text-blue-600">
                              💡 Tip: Er zijn momenteel geen pakketten die {filters.daysMin}+ dagen onderweg zijn.
                            </span>
                          )}
                        </p>
                      </div>
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

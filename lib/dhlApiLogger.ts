// lib/dhlApiLogger.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface DHLApiStats {
  primaryKeyCalls: number;
  secondaryKeyCalls: number;
  totalCalls: number;
  lastReset: Date;
  currentKey: 'primary' | 'secondary';
  callLimit: number;
  primaryKeyAvailable: boolean;
  secondaryKeyAvailable: boolean;
  hoursSinceReset: number;
}

/**
 * Log a DHL API call to the database
 */
export async function logDHLApiCall(params: {
  keyType: 'primary' | 'secondary';
  trackingCode?: string;
  endpoint: string;
  responseStatus?: number;
  responseTimeMs?: number;
  success: boolean;
  errorMessage?: string;
  rateLimited?: boolean;
}): Promise<void> {
  try {
    // Log detailed call info
    await supabase
      .from('dhl_api_call_logs')
      .insert({
        api_key_type: params.keyType,
        tracking_code: params.trackingCode,
        endpoint: params.endpoint,
        response_status: params.responseStatus,
        response_time_ms: params.responseTimeMs,
        success: params.success,
        error_message: params.errorMessage,
        rate_limited: params.rateLimited || false
      });

    // Increment daily counter
    await supabase.rpc('increment_daily_counter', {
      p_counter_type: 'dhl_api_calls',
      p_counter_key: params.keyType,
      p_increment: 1
    });

    console.log(`📊 DHL API Call logged: ${params.keyType} key, ${params.endpoint}, success: ${params.success}`);

  } catch (error) {
    console.error('❌ Failed to log DHL API call:', error);
    // Don't throw error to prevent disrupting main flow
  }
}

/**
 * Get current DHL API usage statistics from database
 */
export async function getDHLApiStats(): Promise<DHLApiStats> {
  try {
    const callLimit = parseInt(process.env.DHL_API_CALL_LIMIT || '250');
    
    // Get today's counters
    const { data: counters, error } = await supabase
      .from('system_daily_counters')
      .select('counter_key, counter_value, last_updated')
      .eq('counter_type', 'dhl_api_calls')
      .eq('counter_date', new Date().toISOString().split('T')[0]);

    if (error) {
      console.error('❌ Failed to fetch DHL API stats:', error);
      // Return fallback stats
      return getFallbackStats(callLimit);
    }

    const primaryCounter = counters?.find(c => c.counter_key === 'primary');
    const secondaryCounter = counters?.find(c => c.counter_key === 'secondary');

    const primaryKeyCalls = primaryCounter?.counter_value || 0;
    const secondaryKeyCalls = secondaryCounter?.counter_value || 0;
    const totalCalls = primaryKeyCalls + secondaryKeyCalls;

    // Determine which key to use
    let currentKey: 'primary' | 'secondary' = 'primary';
    if (primaryKeyCalls >= callLimit && process.env.DHL_API_KEY_SECONDARY) {
      currentKey = 'secondary';
    }

    // Calculate hours since last reset (start of day)
    const lastResetTime = primaryCounter?.last_updated || secondaryCounter?.last_updated;
    const lastReset = lastResetTime ? new Date(lastResetTime) : new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const hoursSinceReset = Math.round((new Date().getTime() - startOfDay.getTime()) / (1000 * 60 * 60) * 10) / 10;

    return {
      primaryKeyCalls,
      secondaryKeyCalls,
      totalCalls,
      lastReset,
      currentKey,
      callLimit,
      primaryKeyAvailable: !!process.env.DHL_API_KEY,
      secondaryKeyAvailable: !!process.env.DHL_API_KEY_SECONDARY,
      hoursSinceReset
    };

  } catch (error) {
    console.error('❌ Error getting DHL API stats:', error);
    return getFallbackStats(parseInt(process.env.DHL_API_CALL_LIMIT || '250'));
  }
}

/**
 * Get appropriate DHL API key based on current usage
 */
export async function getDHLApiKey(): Promise<{ 
  key: string; 
  keyType: 'primary' | 'secondary'; 
  stats: DHLApiStats 
}> {
  const stats = await getDHLApiStats();
  const primaryKey = process.env.DHL_API_KEY;
  const secondaryKey = process.env.DHL_API_KEY_SECONDARY;

  let selectedKey: string;
  let keyType: 'primary' | 'secondary';

  // Use secondary key if primary has hit limit and secondary is available
  if (stats.primaryKeyCalls >= stats.callLimit && secondaryKey) {
    selectedKey = secondaryKey;
    keyType = 'secondary';
    console.log(`🔄 Switching to secondary DHL API key (Primary: ${stats.primaryKeyCalls}/${stats.callLimit})`);
  } else {
    selectedKey = primaryKey || '';
    keyType = 'primary';
  }

  // Log warning if approaching limits
  if (keyType === 'primary' && stats.primaryKeyCalls >= stats.callLimit - 10) {
    console.log(`⚠️ Primary API key approaching limit! ${stats.primaryKeyCalls}/${stats.callLimit} calls used`);
  }
  if (keyType === 'secondary' && stats.secondaryKeyCalls >= stats.callLimit - 10) {
    console.log(`⚠️ Secondary API key approaching limit! ${stats.secondaryKeyCalls}/${stats.callLimit} calls used`);
  }

  return { key: selectedKey, keyType, stats };
}

/**
 * Reset daily counters (typically called at midnight)
 */
export async function resetDailyCounters(): Promise<void> {
  try {
    await supabase
      .from('system_daily_counters')
      .update({ 
        counter_value: 0, 
        last_updated: new Date().toISOString() 
      })
      .eq('counter_type', 'dhl_api_calls');

    console.log('🔄 DHL API daily counters reset');
  } catch (error) {
    console.error('❌ Failed to reset daily counters:', error);
  }
}

/**
 * Fallback stats when database is unavailable
 */
function getFallbackStats(callLimit: number): DHLApiStats {
  return {
    primaryKeyCalls: 0,
    secondaryKeyCalls: 0,
    totalCalls: 0,
    lastReset: new Date(),
    currentKey: 'primary',
    callLimit,
    primaryKeyAvailable: !!process.env.DHL_API_KEY,
    secondaryKeyAvailable: !!process.env.DHL_API_KEY_SECONDARY,
    hoursSinceReset: 0
  };
}
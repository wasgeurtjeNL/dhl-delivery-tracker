// pages/api/cron/test-refresh.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { scrapeDHL } from '@/lib/scrapeDHL';
import { logTrackingAction } from '@/lib/logTrackingAction';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rate limiting - will be overridden by settings
let MAX_TRACKINGS_PER_RUN = 20;
let DELAY_BETWEEN_SCRAPES = 3000; // 3 seconds between scrapes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cronStartTime = new Date();
    console.log('🧪 Starting TEST automatic tracking refresh cron job...');

    // Check if cron job is enabled in system settings and get cron configuration
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('auto_refresh_enabled, emergency_stop, cron_frequency_minutes, cron_max_trackings_per_run, cron_delay_between_scrapes, last_cron_run')
      .limit(1)
      .single();

    if (settingsError) {
      console.error('Failed to fetch system settings:', settingsError);
      return res.status(500).json({ error: 'Could not fetch system settings' });
    }

    // Check if enough time has passed since last run based on frequency setting
    const frequencyMinutes = settings.cron_frequency_minutes || 60;
    if (settings.last_cron_run) {
      const lastRun = new Date(settings.last_cron_run);
      const minutesSinceLastRun = (cronStartTime.getTime() - lastRun.getTime()) / (1000 * 60);
      
      if (minutesSinceLastRun < frequencyMinutes) {
        const nextRunIn = Math.ceil(frequencyMinutes - minutesSinceLastRun);
        console.log(`⏱️ TEST Cron job called too early. Last run: ${minutesSinceLastRun.toFixed(1)} min ago. Need ${frequencyMinutes} min interval. Next run in ${nextRunIn} min.`);
        return res.status(200).json({ 
          message: 'Skipped - too early',
          lastRun: lastRun.toISOString(),
          frequencyMinutes,
          minutesSinceLastRun: Math.round(minutesSinceLastRun * 10) / 10,
          nextRunInMinutes: nextRunIn
        });
      }
    }

    console.log(`🎯 TEST Cron job running with ${frequencyMinutes} minute frequency`);

    // Apply settings to rate limiting
    if (settings.cron_max_trackings_per_run) {
      MAX_TRACKINGS_PER_RUN = settings.cron_max_trackings_per_run;
    }
    if (settings.cron_delay_between_scrapes) {
      DELAY_BETWEEN_SCRAPES = settings.cron_delay_between_scrapes;
    }

    console.log(`⚙️ TEST Cron settings: max ${MAX_TRACKINGS_PER_RUN} trackings, ${DELAY_BETWEEN_SCRAPES}ms delay`);

    // Update cron start time in settings
    await supabase
      .from('system_settings')
      .update({ 
        last_cron_run: cronStartTime.toISOString(),
        last_cron_status: 'running'
      })
      .eq('id', 1);

    // Check if auto refresh is disabled or emergency stop is active
    if (!settings.auto_refresh_enabled || settings.emergency_stop) {
      const reason = settings.emergency_stop ? 'Emergency stop active' : 'Auto refresh disabled';
      console.log(`🚨 TEST ${reason} - skipping cron job`);
      
      // Update status
      await supabase
        .from('system_settings')
        .update({ 
          last_cron_status: 'skipped',
          last_cron_summary: { 
            reason,
            timestamp: cronStartTime.toISOString(),
            duration_ms: Date.now() - cronStartTime.getTime()
          }
        })
        .eq('id', 1);

      return res.status(200).json({ 
        status: 'skipped', 
        reason 
      });
    }

    console.log(`⏰ TEST Time to run! Frequency: every ${frequencyMinutes} minutes`);

    // Get trackings that need refreshing
    const { data: trackings, error: trackingsError } = await supabase
      .from('tracking_matches')
      .select('tracking_code, email, first_name, last_name, order_id, created_at, last_scraped_at, delivery_status')
      .eq('is_active', true)
      .neq('delivery_status', 'bezorgd')
      .order('last_scraped_at', { ascending: true, nullsFirst: true }) // Prioritize never-scraped or oldest-scraped
      .limit(MAX_TRACKINGS_PER_RUN);

    if (trackingsError) {
      console.error('Failed to fetch trackings:', trackingsError);
      return res.status(500).json({ error: 'Could not fetch trackings' });
    }

    if (!trackings || trackings.length === 0) {
      console.log('✅ TEST No trackings found that need refreshing');
      
      // Update status
      await supabase
        .from('system_settings')
        .update({ 
          last_cron_status: 'completed',
          last_cron_summary: { 
            total_processed: 0,
            successful: 0,
            failed: 0,
            message: 'No trackings need refreshing',
            timestamp: cronStartTime.toISOString(),
            duration_ms: Date.now() - cronStartTime.getTime()
          }
        })
        .eq('id', 1);
      
      return res.status(200).json({ 
        status: 'completed', 
        processed: 0,
        message: 'No trackings need refreshing' 
      });
    }

    // Filter trackings that haven't been scraped in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const trackingsToProcess = trackings.filter(tracking => {
      if (!tracking.last_scraped_at) return true; // Never scraped
      const lastScraped = new Date(tracking.last_scraped_at);
      return lastScraped < oneHourAgo;
    });

    if (trackingsToProcess.length === 0) {
      console.log('✅ TEST All trackings were recently scraped - skipping');
      
      // Update status
      await supabase
        .from('system_settings')
        .update({ 
          last_cron_status: 'completed',
          last_cron_summary: { 
            total_processed: 0,
            successful: 0,
            failed: 0,
            message: 'All trackings recently scraped',
            timestamp: cronStartTime.toISOString(),
            duration_ms: Date.now() - cronStartTime.getTime()
          }
        })
        .eq('id', 1);
      
      return res.status(200).json({ 
        status: 'completed', 
        processed: 0,
        message: 'All trackings recently scraped' 
      });
    }

    console.log(`🔄 TEST Processing ${trackingsToProcess.length} trackings...`);

    let successCount = 0;
    let errorCount = 0;
    const results: Array<{trackingCode: string, status: 'success' | 'failed', result: string}> = [];

    // Process only the first tracking for testing to avoid overwhelming
    const testTracking = trackingsToProcess[0];
    const { tracking_code, email, first_name, last_name, order_id } = testTracking;

    try {
      console.log(`📦 TEST Processing 1/1: ${tracking_code}`);

      // Scrape DHL for this tracking
      const result = await scrapeDHL(tracking_code);
      
      // Update database with fresh scraping result
      const updateData: any = {
        delivery_status: result.deliveryStatus,
        last_status_check: new Date().toISOString(),
        last_scraped_at: new Date().toISOString(),
        is_active: result.deliveryStatus !== 'bezorgd'
      };

      // Add duration information if available
      if (result.afleverMoment) {
        updateData.aflever_moment = result.afleverMoment.toISOString();
      }
      if (result.afgegevenMoment) {
        updateData.afgegeven_moment = result.afgegevenMoment.toISOString();
      }
      if (result.duration) {
        updateData.duration = result.duration;
      }
      if (result.durationDays) {
        updateData.duration_days = result.durationDays;
      }

      const { error: updateError } = await supabase
        .from('tracking_matches')
        .update(updateData)
        .eq('tracking_code', tracking_code);

      if (updateError) {
        console.error(`❌ TEST Error updating ${tracking_code}:`, updateError);
        errorCount++;
        results.push({
          trackingCode: tracking_code,
          status: 'failed',
          result: 'Database update failed'
        });
      } else {
        // Log the automatic scraping action
        try {
          await logTrackingAction({
            tracking_code,
            order_id: order_id?.toString() || 'unknown',
            email,
            action_type: 'auto_scrape',
            details: {
              delivery_status: result.deliveryStatus,
              duration: result.duration,
              duration_days: result.durationDays,
              scraping_method: 'test_cron_auto_refresh',
              processing_time: result.processingTime,
              cron_batch: new Date().toISOString()
            }
          });
        } catch (logError) {
          console.error(`⚠️ TEST Error logging action for ${tracking_code}:`, logError);
        }

        successCount++;
        results.push({
          trackingCode: tracking_code,
          status: 'success',
          result: result.deliveryStatus
        });

        console.log(`✅ TEST ${tracking_code} → ${result.deliveryStatus} (${result.duration})`);

        // If delivered, mark as inactive
        if (result.deliveryStatus === 'bezorgd') {
          console.log(`🎉 TEST Package ${tracking_code} delivered! Marking as inactive.`);
        }
      }

    } catch (error) {
      console.error(`❌ TEST Error processing ${tracking_code}:`, error);
      errorCount++;
      
      results.push({
        trackingCode: tracking_code,
        status: 'failed',
        result: error instanceof Error ? error.message : 'Unknown error'
      });

      // Log the error
      try {
        await logTrackingAction({
          tracking_code,
          order_id: order_id?.toString() || 'unknown',
          email,
          action_type: 'auto_scrape_error',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            scraping_method: 'test_cron_auto_refresh',
            cron_batch: new Date().toISOString()
          }
        });
      } catch (logError) {
        console.error(`⚠️ TEST Error logging error for ${tracking_code}:`, logError);
      }
    }

    // Log cron job completion
    const cronEndTime = new Date();
    const cronSummary = {
      total_processed: 1,
      successful: successCount,
      failed: errorCount,
      duration_ms: cronEndTime.getTime() - cronStartTime.getTime(),
      timestamp: cronStartTime.toISOString(),
      completed_at: cronEndTime.toISOString(),
      results_summary: {
        delivered_packages: results.filter(r => r.status === 'success' && r.result === 'bezorgd').length,
        in_transit: results.filter(r => r.status === 'success' && r.result === 'onderweg').length,
        errors: results.filter(r => r.status === 'failed').length
      },
      settings_used: {
        max_trackings: MAX_TRACKINGS_PER_RUN,
        delay_ms: DELAY_BETWEEN_SCRAPES,
        frequency_minutes: settings.cron_frequency_minutes
      },
      test_mode: true
    };

    // Update settings with completion status
    await supabase
      .from('system_settings')
      .update({ 
        last_cron_status: 'completed',
        last_cron_summary: cronSummary
      })
      .eq('id', 1);

    console.log(`🏁 TEST Cron job completed: ${successCount} success, ${errorCount} errors in ${cronSummary.duration_ms}ms`);

    return res.status(200).json({
      status: 'completed',
      processed: 1,
      successful: successCount,
      failed: errorCount,
      results: results,
      summary: cronSummary,
      message: 'TEST MODE: Only processed 1 tracking for testing'
    });

  } catch (error) {
    console.error('💥 TEST Critical error in cron job:', error);
    
    // Update settings with error status
    const errorSummary = {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - (new Date()).getTime(),
      test_mode: true
    };

    try {
      await supabase
        .from('system_settings')
        .update({ 
          last_cron_status: 'error',
          last_cron_summary: errorSummary
        })
        .eq('id', 1);
    } catch (updateError) {
      console.error('TEST Error updating cron status:', updateError);
    }
    
    return res.status(500).json({
      error: 'Critical error during TEST cron job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 
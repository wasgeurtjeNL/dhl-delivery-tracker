// pages/api/cron/refresh-trackings.ts
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
    // Check if this is a valid cron request (can be called by Vercel Cron or external service)
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cronStartTime = new Date();
    console.log('🕒 Starting automatic tracking refresh cron job...');

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
        console.log(`⏱️ Cron job called too early. Last run: ${minutesSinceLastRun.toFixed(1)} min ago. Need ${frequencyMinutes} min interval. Next run in ${nextRunIn} min.`);
        return res.status(200).json({ 
          message: 'Skipped - too early',
          lastRun: lastRun.toISOString(),
          frequencyMinutes,
          minutesSinceLastRun: Math.round(minutesSinceLastRun * 10) / 10,
          nextRunInMinutes: nextRunIn
        });
      }
    }

    console.log(`🎯 Cron job running with ${frequencyMinutes} minute frequency`);

    // Apply settings to rate limiting
    if (settings.cron_max_trackings_per_run) {
      MAX_TRACKINGS_PER_RUN = settings.cron_max_trackings_per_run;
    }
    if (settings.cron_delay_between_scrapes) {
      DELAY_BETWEEN_SCRAPES = settings.cron_delay_between_scrapes;
    }

    console.log(`⚙️ Cron settings: max ${MAX_TRACKINGS_PER_RUN} trackings, ${DELAY_BETWEEN_SCRAPES}ms delay`);

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
      console.log(`🚨 ${reason} - skipping cron job`);
      
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

    // Check if it's time to run based on frequency setting
    const cronFrequencyMinutes = settings.cron_frequency_minutes || 60;
    if (settings.last_cron_run) {
      const lastRunTime = new Date(settings.last_cron_run);
      const timeSinceLastRun = cronStartTime.getTime() - lastRunTime.getTime();
      const requiredInterval = cronFrequencyMinutes * 60 * 1000; // Convert to milliseconds
      
      if (timeSinceLastRun < requiredInterval) {
        const minutesUntilNext = Math.ceil((requiredInterval - timeSinceLastRun) / (1000 * 60));
        console.log(`⏰ Too early to run - next run in ${minutesUntilNext} minutes (frequency: ${cronFrequencyMinutes}min)`);
        
        return res.status(200).json({ 
          status: 'too_early', 
          message: `Next run in ${minutesUntilNext} minutes`,
          frequency_minutes: cronFrequencyMinutes,
          last_run: settings.last_cron_run
        });
      }
    }

    console.log(`⏰ Time to run! Frequency: every ${cronFrequencyMinutes} minutes`);

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
      console.log('✅ No trackings found that need refreshing');
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
      console.log('✅ All trackings were recently scraped - skipping');
      return res.status(200).json({ 
        status: 'completed', 
        processed: 0,
        message: 'All trackings recently scraped' 
      });
    }

    console.log(`🔄 Processing ${trackingsToProcess.length} trackings...`);

    let successCount = 0;
    let errorCount = 0;
    const results: Array<{trackingCode: string, status: 'success' | 'failed', result: string}> = [];

    // Process trackings one by one with delays (same as manual queue)
    for (let i = 0; i < trackingsToProcess.length; i++) {
      const tracking = trackingsToProcess[i];
      const { tracking_code, email, first_name, last_name, order_id } = tracking;

      try {
        console.log(`📦 Processing ${i + 1}/${trackingsToProcess.length}: ${tracking_code}`);

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
          console.error(`❌ Error updating ${tracking_code}:`, updateError);
          errorCount++;
          results.push({
            trackingCode: tracking_code,
            status: 'failed',
            result: 'Database update failed'
          });
          continue;
        }

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
              scraping_method: 'cron_auto_refresh',
              processing_time: result.processingTime,
              cron_batch: new Date().toISOString()
            }
          });
        } catch (logError) {
          console.error(`⚠️ Error logging action for ${tracking_code}:`, logError);
        }

        successCount++;
        results.push({
          trackingCode: tracking_code,
          status: 'success',
          result: result.deliveryStatus
        });

        console.log(`✅ ${tracking_code} → ${result.deliveryStatus} (${result.duration})`);

        // If delivered, mark as inactive
        if (result.deliveryStatus === 'bezorgd') {
          console.log(`🎉 Package ${tracking_code} delivered! Marking as inactive.`);
        }

      } catch (error) {
        console.error(`❌ Error processing ${tracking_code}:`, error);
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
              scraping_method: 'cron_auto_refresh',
              cron_batch: new Date().toISOString()
            }
          });
        } catch (logError) {
          console.error(`⚠️ Error logging error for ${tracking_code}:`, logError);
        }
      }

      // Delay between requests to avoid overwhelming DHL
      if (i < trackingsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SCRAPES));
      }
    }

    // Log cron job completion
    const cronEndTime = new Date();
    const cronSummary = {
      total_processed: trackingsToProcess.length,
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
      }
    };

    // Update settings with completion status
    await supabase
      .from('system_settings')
      .update({ 
        last_cron_status: 'completed',
        last_cron_summary: cronSummary
      })
      .eq('id', 1);

    console.log(`🏁 Cron job completed: ${successCount} success, ${errorCount} errors in ${cronSummary.duration_ms}ms`);

    return res.status(200).json({
      status: 'completed',
      processed: trackingsToProcess.length,
      successful: successCount,
      failed: errorCount,
      results: results.slice(0, 10), // Return first 10 results
      summary: cronSummary
    });

  } catch (error) {
    console.error('💥 Critical error in cron job:', error);
    
    // Update settings with error status
    const errorSummary = {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - (new Date()).getTime()
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
      console.error('Error updating cron status:', updateError);
    }
    
    return res.status(500).json({
      error: 'Critical error during cron job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 

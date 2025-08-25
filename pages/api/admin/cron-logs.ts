// pages/api/admin/cron-logs.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = '50' } = req.query;

    // Get cron job logs from tracking_logs table
    const { data: cronLogs, error: logsError } = await supabase
      .from('tracking_logs')
      .select('*')
      .in('action_type', ['auto_scrape', 'auto_scrape_error', 'cron_job_start', 'cron_job_complete'])
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string));

    if (logsError) {
      throw logsError;
    }

    // Get current settings to show cron status
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('auto_refresh_enabled, emergency_stop, last_cron_run, last_cron_status, last_cron_summary, cron_frequency_minutes, cron_max_trackings_per_run, cron_delay_between_scrapes')
      .limit(1)
      .single();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      // Continue without settings if they don't exist
    }

    // Group logs by cron batch to show summary
    const cronBatches = new Map();
    const individualLogs = [];

    cronLogs?.forEach(log => {
      if (log.details?.cron_batch) {
        const batchKey = log.details.cron_batch;
        if (!cronBatches.has(batchKey)) {
          cronBatches.set(batchKey, {
            timestamp: batchKey,
            logs: [],
            summary: {
              total: 0,
              success: 0,
              failed: 0,
              delivered: 0
            }
          });
        }
        
        const batch = cronBatches.get(batchKey);
        batch.logs.push(log);
        batch.summary.total++;
        
        if (log.action_type === 'auto_scrape') {
          batch.summary.success++;
          if (log.details?.delivery_status === 'bezorgd') {
            batch.summary.delivered++;
          }
        } else if (log.action_type === 'auto_scrape_error') {
          batch.summary.failed++;
        }
      } else {
        individualLogs.push(log);
      }
    });

    // Convert batches to array and sort by timestamp
    const batchArray = Array.from(cronBatches.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Calculate next expected run time
    let nextRunTime = null;
    if (settings?.last_cron_run && settings?.cron_frequency_minutes) {
      const lastRun = new Date(settings.last_cron_run);
      nextRunTime = new Date(lastRun.getTime() + (settings.cron_frequency_minutes * 60 * 1000));
    }

    // Calculate cron health status
    const cronHealth = {
      status: 'unknown',
      message: 'Status onbekend',
      lastRun: settings?.last_cron_run || null,
      nextRun: nextRunTime?.toISOString() || null,
      isOverdue: false
    };

    if (!settings?.auto_refresh_enabled) {
      cronHealth.status = 'disabled';
      cronHealth.message = 'Automatische refresh is uitgeschakeld';
    } else if (settings?.emergency_stop) {
      cronHealth.status = 'stopped';
      cronHealth.message = 'Emergency stop is actief';
    } else if (settings?.last_cron_run) {
      const now = new Date();
      const lastRun = new Date(settings.last_cron_run);
      const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);
      const expectedInterval = settings.cron_frequency_minutes + 5; // 5 min buffer
      
      if (minutesSinceLastRun > expectedInterval) {
        cronHealth.status = 'overdue';
        cronHealth.message = `Laatste run was ${Math.round(minutesSinceLastRun)} minuten geleden (verwacht elke ${settings.cron_frequency_minutes} min)`;
        cronHealth.isOverdue = true;
      } else if (settings.last_cron_status === 'completed') {
        cronHealth.status = 'healthy';
        cronHealth.message = `Laatste run succesvol - volgende run over ${Math.max(0, Math.round((settings.cron_frequency_minutes * 60 * 1000 - (now.getTime() - lastRun.getTime())) / (1000 * 60)))} minuten`;
      } else {
        cronHealth.status = 'warning';
        cronHealth.message = `Laatste run had problemen: ${settings.last_cron_status}`;
      }
    } else {
      cronHealth.status = 'never_run';
      cronHealth.message = 'Cron job is nog nooit uitgevoerd';
    }

    return res.status(200).json({
      success: true,
      data: {
        cronBatches: batchArray,
        individualLogs,
        settings: settings || {},
        cronHealth,
        statistics: {
          totalBatches: batchArray.length,
          totalLogs: cronLogs?.length || 0,
          avgTracksPerBatch: batchArray.length > 0 
            ? Math.round(batchArray.reduce((sum, batch) => sum + batch.summary.total, 0) / batchArray.length)
            : 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching cron logs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch cron logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 
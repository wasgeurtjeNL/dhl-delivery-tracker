// pages/api/admin/settings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '../../../lib/adminAuth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SystemSettings {
  id?: number;
  day_3_timing: number;
  day_5_timing: number;
  day_10_timing: number;
  loyalty_points: number;
  replacement_product_id: number;
  scraping_interval_minutes: number;
  auto_run_enabled: boolean;
  auto_run_time: string; // "14:00"
  email_template_day3: string;
  email_template_day5: string;
  email_template_day10: string;
  emergency_stop: boolean;
  auto_refresh_enabled: boolean;
  // NEW: Cron frequency settings
  cron_frequency_minutes: number;
  cron_max_trackings_per_run: number;
  cron_delay_between_scrapes: number;
  last_cron_run: string | null;
  last_cron_status: string | null;
  last_cron_summary: any;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  day_3_timing: 3,
  day_5_timing: 5,
  day_10_timing: 10,
  loyalty_points: 60,
  replacement_product_id: 1893,
  scraping_interval_minutes: 60,
  auto_run_enabled: true,
  auto_run_time: "14:00",
  email_template_day3: "dag3_notify",
  email_template_day5: "dag5_choice",
  email_template_day10: "dag10_gift_notice",
  emergency_stop: false,
  auto_refresh_enabled: true,
  // NEW: Cron settings
  cron_frequency_minutes: 60,  // Default elk uur
  cron_max_trackings_per_run: 20,  // Max 20 trackings per run
  cron_delay_between_scrapes: 3000,  // 3 seconden tussen scrapes
  last_cron_run: null,
  last_cron_status: null,
  last_cron_summary: null
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    switch (req.method) {
      case 'GET':
        return await getSettings(res);
      case 'POST':
        return await updateSettings(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Settings API error:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to handle settings request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function getSettings(res: NextApiResponse) {
  // Probeer instellingen op te halen uit database
  const { data: settings, error } = await supabase
    .from('system_settings')
    .select('*')
    .limit(1)
    .single();

  if (error && error.code === 'PGRST116') {
    // Geen instellingen gevonden, maak default aan
    const { data: newSettings, error: insertError } = await supabase
      .from('system_settings')
      .insert(DEFAULT_SETTINGS)
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return res.status(200).json({ settings: newSettings });
  }

  if (error) {
    throw error;
  }

  return res.status(200).json({ settings });
}

async function updateSettings(req: NextApiRequest, res: NextApiResponse) {
  const updates = req.body;

  // Valideer input
  const allowedFields = [
    'day_3_timing', 'day_5_timing', 'day_10_timing', 
    'loyalty_points', 'replacement_product_id', 
    'scraping_interval_minutes', 'auto_run_enabled', 
    'auto_run_time', 'email_template_day3', 
    'email_template_day5', 'email_template_day10',
    'emergency_stop', 'auto_refresh_enabled',
    // NEW: Cron settings
    'cron_frequency_minutes', 'cron_max_trackings_per_run', 
    'cron_delay_between_scrapes', 'last_cron_run', 
    'last_cron_status', 'last_cron_summary'
  ];

  const validUpdates: Partial<SystemSettings> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      (validUpdates as any)[key] = value;
    }
  }

  if (Object.keys(validUpdates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // Update settings
  const { data: updatedSettings, error } = await supabase
    .from('system_settings')
    .update({
      ...validUpdates,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1)  // Explicitly target the first record
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Log de wijziging
  await supabase.from('admin_logs').insert({
    action: 'settings_updated',
    details: {
      updated_fields: Object.keys(validUpdates),
      old_values: updates,
      new_values: updatedSettings
    },
    created_at: new Date().toISOString()
  });

  return res.status(200).json({ 
    settings: updatedSettings,
    message: 'Settings updated successfully'
  });
} 
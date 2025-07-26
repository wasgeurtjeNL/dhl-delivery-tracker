// pages/api/admin/override.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendMandrillEmail } from '@/lib/sendMandrillMail';
import { sendReplacementProduct } from '@/lib/sendReplacementProduct';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, payload } = req.body;

  try {
    switch (action) {
      case 'emergency_stop':
        return await emergencyStop(res);
      case 'emergency_resume':
        return await emergencyResume(res);
      case 'skip_email':
        return await skipEmail(res, payload);
      case 'force_bulk_email':
        return await forceBulkEmail(res, payload);
      case 'bulk_mark_delivered':
        return await bulkMarkDelivered(res, payload);
      case 'reset_tracking':
        return await resetTracking(res, payload);
      default:
        return res.status(400).json({ error: 'Unknown override action' });
    }
  } catch (error) {
    console.error(`Override ${action} error:`, error);
    return res.status(500).json({ 
      error: `Override ${action} failed`,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Emergency stop - zet emergency_stop flag aan
async function emergencyStop(res: NextApiResponse) {
  const { data: settings, error } = await supabase
    .from('system_settings')
    .update({ emergency_stop: true, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Log emergency stop
  await supabase.from('admin_logs').insert({
    action: 'emergency_stop',
    details: {
      timestamp: new Date().toISOString(),
      triggered_by: 'admin'
    }
  });

  return res.status(200).json({
    success: true,
    message: 'Emergency stop activated - all automated emails are paused',
    settings
  });
}

// Emergency resume - zet emergency_stop flag uit
async function emergencyResume(res: NextApiResponse) {
  const { data: settings, error } = await supabase
    .from('system_settings')
    .update({ emergency_stop: false, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Log emergency resume
  await supabase.from('admin_logs').insert({
    action: 'emergency_resume',
    details: {
      timestamp: new Date().toISOString(),
      resumed_by: 'admin'
    }
  });

  return res.status(200).json({
    success: true,
    message: 'Emergency stop deactivated - automated emails resumed',
    settings
  });
}

// Skip email voor specifieke tracking codes
async function skipEmail(res: NextApiResponse, payload: any) {
  const { trackingCodes, reason } = payload || {};

  if (!trackingCodes || !Array.isArray(trackingCodes)) {
    return res.status(400).json({ error: 'trackingCodes array required' });
  }

  const results = {
    success: 0,
    errors: 0,
    details: [] as any[]
  };

  for (const trackingCode of trackingCodes) {
    try {
      // Log skip actie
      await supabase.from('tracking_logs').insert({
        tracking_code: trackingCode,
        order_id: 'unknown',
        email: '',
        action_type: 'admin_skip',
        details: {
          skipped_by: 'admin',
          reason: reason || 'Manual skip',
          timestamp: new Date().toISOString()
        }
      });

      results.success++;
      results.details.push({ trackingCode, status: 'skipped' });
    } catch (error) {
      results.errors++;
      results.details.push({ 
        trackingCode, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: `Skipped emails for ${results.success} tracking codes`,
    results
  });
}

// Force bulk email verzending
async function forceBulkEmail(res: NextApiResponse, payload: any) {
  const { trackingCodes, emailType, testMode = false } = payload || {};

  if (!trackingCodes || !Array.isArray(trackingCodes) || !emailType) {
    return res.status(400).json({ error: 'trackingCodes array and emailType required' });
  }

  const validEmailTypes = ['dag3_notify', 'dag5_choice', 'dag10_gift_notice'];
  if (!validEmailTypes.includes(emailType)) {
    return res.status(400).json({ error: 'Invalid emailType' });
  }

  const results = {
    success: 0,
    errors: 0,
    details: [] as any[]
  };

  for (const trackingCode of trackingCodes) {
    try {
      // Haal tracking match op
      const { data: match, error } = await supabase
        .from('tracking_matches')
        .select('*')
        .eq('tracking_code', trackingCode)
        .single();

      if (error || !match) {
        results.errors++;
        results.details.push({ 
          trackingCode, 
          status: 'error', 
          error: 'Tracking not found' 
        });
        continue;
      }

      if (!testMode) {
        // Verstuur email
        await sendMandrillEmail({
          to: { email: match.email, name: match.first_name },
          templateName: emailType,
          mergeVars: {
            first_name: match.first_name,
            order_id: match.order_id,
            tracking_code: match.tracking_code,
            button_url_1: `https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=${match.order_id}`,
            button_url_2: `https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=${match.order_id}`,
            button_url_3: `https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=${match.order_id}`
          }
        });

        // Log actie
        await supabase.from('tracking_logs').insert({
          tracking_code: trackingCode,
          order_id: match.order_id?.toString() || 'unknown',
          email: match.email,
          action_type: `admin_bulk_${emailType}`,
          details: {
            bulk_action: true,
            forced_by: 'admin',
            email_type: emailType,
            timestamp: new Date().toISOString()
          }
        });
      }

      results.success++;
      results.details.push({ 
        trackingCode, 
        status: testMode ? 'test_success' : 'sent',
        email: match.email,
        template: emailType
      });

    } catch (error) {
      results.errors++;
      results.details.push({ 
        trackingCode, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: testMode 
      ? `Test mode: Would send ${emailType} to ${results.success} customers`
      : `Sent ${emailType} emails to ${results.success} customers`,
    results
  });
}

// Bulk mark als bezorgd
async function bulkMarkDelivered(res: NextApiResponse, payload: any) {
  const { trackingCodes, reason } = payload || {};

  if (!trackingCodes || !Array.isArray(trackingCodes)) {
    return res.status(400).json({ error: 'trackingCodes array required' });
  }

  const results = {
    success: 0,
    errors: 0,
    details: [] as any[]
  };

  for (const trackingCode of trackingCodes) {
    try {
      // Log als bezorgd
      await supabase.from('tracking_logs').insert({
        tracking_code: trackingCode,
        order_id: 'unknown',
        email: '',
        action_type: 'admin_mark_delivered',
        details: {
          marked_delivered_by: 'admin',
          reason: reason || 'Manual override',
          timestamp: new Date().toISOString()
        }
      });

      results.success++;
      results.details.push({ trackingCode, status: 'marked_delivered' });
    } catch (error) {
      results.errors++;
      results.details.push({ 
        trackingCode, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: `Marked ${results.success} tracking codes as delivered`,
    results
  });
}

// Reset tracking (verwijder logs)
async function resetTracking(res: NextApiResponse, payload: any) {
  const { trackingCodes, confirmReset } = payload || {};

  if (!trackingCodes || !Array.isArray(trackingCodes)) {
    return res.status(400).json({ error: 'trackingCodes array required' });
  }

  if (!confirmReset) {
    return res.status(400).json({ error: 'confirmReset must be true for safety' });
  }

  const results = {
    success: 0,
    errors: 0,
    details: [] as any[]
  };

  for (const trackingCode of trackingCodes) {
    try {
      // Verwijder alle logs voor deze tracking code
      const { error } = await supabase
        .from('tracking_logs')
        .delete()
        .eq('tracking_code', trackingCode);

      if (error) {
        throw error;
      }

      // Log reset actie
      await supabase.from('admin_logs').insert({
        action: 'tracking_reset',
        details: {
          tracking_code: trackingCode,
          reset_by: 'admin',
          timestamp: new Date().toISOString()
        }
      });

      results.success++;
      results.details.push({ trackingCode, status: 'reset' });
    } catch (error) {
      results.errors++;
      results.details.push({ 
        trackingCode, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: `Reset tracking logs for ${results.success} codes`,
    results
  });
} 
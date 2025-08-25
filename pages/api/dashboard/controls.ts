// pages/api/dashboard/controls.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendMandrillEmail } from '@/lib/sendMandrillMail';

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
      case 'search_tracking':
        return await searchTracking(req, res, payload.trackingCode);
      
      case 'send_test_email':
        return await sendTestEmail(req, res, payload);
      
      case 'manual_trigger':
        return await manualTrigger(req, res, payload);
      
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Control action error:', error);
    return res.status(500).json({ 
      error: 'Failed to execute action',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Zoek specifieke tracking code
async function searchTracking(req: NextApiRequest, res: NextApiResponse, trackingCode: string) {
  if (!trackingCode) {
    return res.status(400).json({ error: 'Tracking code required' });
  }

  // Zoek in tracking_matches
  const { data: match, error: matchError } = await supabase
    .from('tracking_matches')
    .select('*')
    .eq('tracking_code', trackingCode)
    .single();

  // Zoek logs voor deze tracking
  const { data: logs, error: logsError } = await supabase
    .from('tracking_logs')
    .select('*')
    .eq('tracking_code', trackingCode)
    .order('created_at', { ascending: false });

  if (matchError && matchError.code !== 'PGRST116') {
    throw matchError;
  }

  return res.status(200).json({
    match: match || null,
    logs: logs || [],
    found: !!match
  });
}

// Verstuur test email
async function sendTestEmail(req: NextApiRequest, res: NextApiResponse, payload: any) {
  const { email, template, testData } = payload;

  if (!email || !template) {
    return res.status(400).json({ error: 'Email and template required' });
  }

  const testMergeVars = {
    first_name: testData?.firstName || 'Test Klant',
    order_id: testData?.orderId || '12345',
    tracking_code: testData?.trackingCode || '3SDFC123456789',
    button_url_1: 'https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=12345',
    button_url_2: 'https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=12345',
    button_url_3: 'https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=12345',
    ...testData?.customVars
  };

  await sendMandrillEmail({
    to: { email, name: testData?.firstName || 'Test Klant' },
    templateName: template,
    mergeVars: testMergeVars
  });

  return res.status(200).json({ 
    success: true, 
    message: `Test email sent to ${email}` 
  });
}

// Handmatige trigger voor specifieke tracking
async function manualTrigger(req: NextApiRequest, res: NextApiResponse, payload: any) {
  const { trackingCode, action } = payload;

  if (!trackingCode || !action) {
    return res.status(400).json({ error: 'Tracking code and action required' });
  }

  // Haal tracking match op
  const { data: match, error } = await supabase
    .from('tracking_matches')
    .select('*')
    .eq('tracking_code', trackingCode)
    .single();

  if (error || !match) {
    return res.status(404).json({ error: 'Tracking not found' });
  }

  // Voer de gevraagde actie uit
  switch (action) {
    case 'force_day3':
      await sendMandrillEmail({
        to: { email: match.email, name: match.first_name },
        templateName: 'dag3_notify',
        mergeVars: { 
          first_name: match.first_name, 
          order_id: match.order_id, 
          tracking_code: match.tracking_code 
        }
      });
      break;

    case 'force_day5':
      await sendMandrillEmail({
        to: { email: match.email, name: match.first_name },
        templateName: 'dag5_choice',
        mergeVars: {
          first_name: match.first_name,
          order_id: match.order_id,
          button_url_1: `https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=${match.order_id}`,
          button_url_2: `https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=${match.order_id}`,
          button_url_3: `https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=${match.order_id}`,
        }
      });
      break;

    case 'force_day10':
      await sendMandrillEmail({
        to: { email: match.email, name: match.first_name },
        templateName: 'dag10_gift_notice',
        mergeVars: { first_name: match.first_name, order_id: match.order_id }
      });
      break;

    default:
      return res.status(400).json({ error: 'Unknown manual action' });
  }

  // Log de handmatige actie
  await supabase.from('tracking_logs').insert({
    tracking_code: trackingCode,
    order_id: match.order_id?.toString() || 'unknown',
    email: match.email,
    action_type: `manual_${action}`,
    details: { 
      manually_triggered: true,
      admin_action: action,
      timestamp: new Date().toISOString()
    }
  });

  return res.status(200).json({ 
    success: true, 
    message: `Manual action ${action} executed for ${trackingCode}` 
  });
} 
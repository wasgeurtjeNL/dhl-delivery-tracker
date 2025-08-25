// pages/api/replacement/validate.ts
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

  const { tracking_code } = req.query;

  if (!tracking_code || typeof tracking_code !== 'string') {
    return res.status(400).json({ 
      error: 'Tracking code is required',
      valid: false
    });
  }

  try {
    console.log(`🔍 Validating tracking code: ${tracking_code}`);

    // 1. Check if tracking code exists in tracking_matches
    const { data: trackingMatch, error: trackingError } = await supabase
      .from('tracking_matches')
      .select('tracking_code, order_id, email, first_name, last_name')
      .eq('tracking_code', tracking_code)
      .single();

    if (trackingError || !trackingMatch) {
      console.log(`❌ Tracking code not found: ${tracking_code}`);
      return res.status(404).json({
        error: 'Tracking code not found',
        valid: false,
        reason: 'TRACKING_NOT_FOUND'
      });
    }

    // 2. Check if replacement already exists
    const { data: existingReplacement, error: replacementError } = await supabase
      .from('replacement_requests')
      .select('id, status, created_at, replacement_order_id')
      .eq('tracking_code', tracking_code)
      .single();

    if (!replacementError && existingReplacement) {
      console.log(`⚠️ Replacement already exists for: ${tracking_code}`);
      return res.status(409).json({
        error: 'Replacement already requested',
        valid: false,
        reason: 'REPLACEMENT_EXISTS',
        existing_replacement: {
          status: existingReplacement.status,
          created_at: existingReplacement.created_at,
          replacement_order_id: existingReplacement.replacement_order_id
        }
      });
    }

    // 3. Check if this tracking code qualifies for replacement (should have triggered day 5 email)
    const { data: day5EmailSent, error: day5Error } = await supabase
      .from('tracking_logs')
      .select('id, action_type, created_at')
      .eq('tracking_code', tracking_code)
      .eq('action_type', 'choice_email_sent')
      .single();

    if (day5Error || !day5EmailSent) {
      console.log(`⚠️ Day 5 email not sent yet for: ${tracking_code}`);
      return res.status(400).json({
        error: 'Replacement not yet available',
        valid: false,
        reason: 'DAY5_EMAIL_NOT_SENT',
        message: 'Je pakket kwalificeert nog niet voor een vervangingsproduct. Wacht tot je de keuze-email hebt ontvangen.'
      });
    }

    console.log(`✅ Tracking code valid for replacement: ${tracking_code}`);

    return res.status(200).json({
      valid: true,
      tracking_info: {
        tracking_code: trackingMatch.tracking_code,
        order_id: trackingMatch.order_id,
        customer: {
          email: trackingMatch.email,
          first_name: trackingMatch.first_name,
          last_name: trackingMatch.last_name
        }
      },
      day5_email_sent_at: day5EmailSent.created_at
    });

  } catch (error) {
    console.error(`❌ Validation error for ${tracking_code}:`, error);
    
    return res.status(500).json({ 
      error: 'Failed to validate tracking code',
      valid: false,
      reason: 'VALIDATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
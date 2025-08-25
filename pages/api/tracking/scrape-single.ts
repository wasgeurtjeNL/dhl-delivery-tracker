// pages/api/tracking/scrape-single.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { scrapeDHL } from '@/lib/scrapeDHL';
import { logTrackingAction } from '@/lib/logTrackingAction';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { trackingCode } = req.body;

    if (!trackingCode) {
      return res.status(400).json({ error: 'Tracking code is required' });
    }

    console.log(`🔄 Scraping single tracking: ${trackingCode}`);

    // Get tracking info from database
    const { data: tracking, error: trackingError } = await supabase
      .from('tracking_matches')
      .select('*')
      .eq('tracking_code', trackingCode)
      .single();

    if (trackingError || !tracking) {
      return res.status(404).json({ error: 'Tracking not found in database' });
    }

    // Scrape DHL for this tracking
    const result = await scrapeDHL(trackingCode);
    
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
      .eq('tracking_code', trackingCode);

    if (updateError) {
      console.error('Error updating tracking:', updateError);
    }

    // Log the scraping action
    try {
      await logTrackingAction({
        tracking_code: trackingCode,
        order_id: tracking.order_id?.toString() || 'unknown',
        email: tracking.email,
        action_type: 'manual_scrape',
        details: {
          delivery_status: result.deliveryStatus,
          duration: result.duration,
          duration_days: result.durationDays,
          scraping_method: 'queue_manual_refresh',
          processing_time: result.processingTime
        }
      });
    } catch (logError) {
      console.error('Error logging action:', logError);
    }

    console.log(`✅ ${trackingCode} → ${result.deliveryStatus} (${result.duration})`);

    return res.status(200).json({
      success: true,
      trackingCode,
      deliveryStatus: result.deliveryStatus,
      duration: result.duration,
      durationDays: result.durationDays,
      processingTime: result.processingTime,
      afleverMoment: result.afleverMoment?.toISOString(),
      afgegevenMoment: result.afgegevenMoment?.toISOString()
    });

  } catch (error) {
    console.error('❌ Error scraping single tracking:', error);
    
    return res.status(500).json({
      error: 'Failed to scrape tracking',
      message: error instanceof Error ? error.message : 'Unknown error',
      trackingCode: req.body.trackingCode
    });
  }
} 
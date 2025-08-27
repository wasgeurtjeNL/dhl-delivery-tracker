// pages/api/admin/bulk-status-update.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { trackingCodes, status } = req.body;

    if (!trackingCodes || !Array.isArray(trackingCodes) || trackingCodes.length === 0) {
      return res.status(400).json({ error: 'Invalid tracking codes provided' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Update the tracking status in the database
    const { data, error } = await supabase
      .from('tracking_matches')
      .update({ 
        // Note: This might need to be adjusted based on your actual database schema
        // You may need to update a status field or create a log entry
        last_status_check: new Date().toISOString()
      })
      .in('tracking_code', trackingCodes);

    if (error) {
      console.error('Error updating tracking status:', error);
      return res.status(500).json({ error: 'Failed to update tracking status' });
    }

    // Create log entries for the status change
    const logEntries = trackingCodes.map(trackingCode => ({
      tracking_code: trackingCode,
      action_type: 'status_update',
      details: { new_status: status, updated_by: 'admin_bulk' },
      created_at: new Date().toISOString()
    }));

    const { error: logError } = await supabase
      .from('tracking_logs')
      .insert(logEntries);

    if (logError) {
      console.error('Error creating log entries:', logError);
      // Don't fail the request if logging fails
    }

    res.status(200).json({ 
      success: true, 
      updated: trackingCodes.length,
      message: `Successfully updated ${trackingCodes.length} tracking(s) to status: ${status}`
    });

  } catch (error) {
    console.error('Bulk status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

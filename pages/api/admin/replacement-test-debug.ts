// pages/api/admin/replacement-test-debug.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const debug = {
      environment: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        WOOCOMMERCE_URL: process.env.WOOCOMMERCE_URL || 'NOT_SET',
        WOOCOMMERCE_CONSUMER_KEY: !!process.env.WOOCOMMERCE_CONSUMER_KEY,
        WOOCOMMERCE_CONSUMER_SECRET: !!process.env.WOOCOMMERCE_CONSUMER_SECRET,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'NOT_SET'
      },
      database: {
        replacement_requests_exists: false,
        tracking_matches_count: 0,
        tracking_logs_count: 0
      },
      woocommerce: {
        connection_error: null
      }
    };

    // Test database
    try {
      const { data: replacementData, error: replacementError } = await supabase
        .from('replacement_requests')
        .select('*')
        .limit(1);
      
      debug.database.replacement_requests_exists = !replacementError;
      
      const { count: trackingCount } = await supabase
        .from('tracking_matches')
        .select('*', { count: 'exact', head: true });
      
      debug.database.tracking_matches_count = trackingCount || 0;

      const { count: logsCount } = await supabase
        .from('tracking_logs')
        .select('*', { count: 'exact', head: true });
      
      debug.database.tracking_logs_count = logsCount || 0;

    } catch (error) {
      debug.database.replacement_requests_exists = false;
    }

    // Test WooCommerce
    try {
      if (process.env.WOOCOMMERCE_URL) {
        const { wooCommerceService } = await import('@/lib/woocommerceService');
        await wooCommerceService.validateConnection();
      } else {
        debug.woocommerce.connection_error = 'WOOCOMMERCE_URL not set';
      }
    } catch (error) {
      debug.woocommerce.connection_error = error instanceof Error ? error.message : 'Unknown error';
    }

    return res.status(200).json({
      success: true,
      debug,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
    
    return res.status(500).json({ 
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
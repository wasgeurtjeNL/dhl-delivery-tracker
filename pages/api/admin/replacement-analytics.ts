// pages/api/admin/replacement-analytics.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ReplacementStats {
  total_requests: number;
  successful_orders: number;
  failed_orders: number;
  pending_orders: number;
  success_rate: number;
  top_products: {
    product_id: number;
    request_count: number;
  }[];
  daily_stats: {
    date: string;
    requests: number;
    successful: number;
    failed: number;
  }[];
  recent_requests: {
    tracking_code: string;
    customer_name: string;
    customer_email: string;
    selected_product_id: number;
    status: string;
    created_at: string;
    replacement_order_id?: string;
  }[];
  conversion_metrics: {
    day5_emails_sent: number;
    replacement_requests: number;
    conversion_rate: number;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { period = '30d' } = req.query;

    console.log(`📊 Generating replacement analytics for period: ${period}`);

    const stats = await generateReplacementAnalytics(period as string);

    return res.status(200).json({
      success: true,
      period,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Replacement analytics generation failed:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate replacement analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function generateReplacementAnalytics(period: string): Promise<ReplacementStats> {
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '7d':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(endDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(endDate.getDate() - 90);
      break;
    default:
      startDate.setDate(endDate.getDate() - 30);
  }

  // Get all replacement requests for the period
  const { data: replacementRequests, error } = await supabase
    .from('replacement_requests')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch replacement requests: ${error.message}`);
  }

  // Calculate overall stats
  const totalRequests = replacementRequests.length;
  const successful = replacementRequests.filter(req => req.status === 'processing' || req.status === 'completed').length;
  const failed = replacementRequests.filter(req => req.status === 'failed').length;
  const pending = replacementRequests.filter(req => req.status === 'pending').length;
  const successRate = totalRequests > 0 ? (successful / totalRequests) * 100 : 0;

  // Calculate top products
  const productCounts: { [key: number]: number } = {};
  replacementRequests.forEach(req => {
    productCounts[req.selected_product_id] = (productCounts[req.selected_product_id] || 0) + 1;
  });

  const topProducts = Object.entries(productCounts)
    .map(([productId, count]) => ({
      product_id: parseInt(productId),
      request_count: count
    }))
    .sort((a, b) => b.request_count - a.request_count)
    .slice(0, 10);

  // Calculate daily stats
  const dailyStats: { [key: string]: any } = {};
  
  for (const req of replacementRequests) {
    const date = new Date(req.created_at).toISOString().split('T')[0];
    
    if (!dailyStats[date]) {
      dailyStats[date] = {
        date,
        requests: 0,
        successful: 0,
        failed: 0
      };
    }
    
    dailyStats[date].requests++;
    if (req.status === 'processing' || req.status === 'completed') {
      dailyStats[date].successful++;
    } else if (req.status === 'failed') {
      dailyStats[date].failed++;
    }
  }

  const dailyStatsArray = Object.values(dailyStats).sort((a: any, b: any) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Get recent requests (last 20)
  const recentRequests = replacementRequests.slice(0, 20).map(req => ({
    tracking_code: req.tracking_code,
    customer_name: req.customer_name,
    customer_email: req.customer_email,
    selected_product_id: req.selected_product_id,
    status: req.status,
    created_at: req.created_at,
    replacement_order_id: req.replacement_order_id
  }));

  // Calculate conversion metrics (Day 5 emails -> replacement requests)
  const { data: day5Emails, error: day5Error } = await supabase
    .from('tracking_logs')
    .select('tracking_code')
    .eq('action_type', 'choice_email_sent')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const day5EmailsCount = day5Error ? 0 : day5Emails.length;
  const conversionRate = day5EmailsCount > 0 ? (totalRequests / day5EmailsCount) * 100 : 0;

  return {
    total_requests: totalRequests,
    successful_orders: successful,
    failed_orders: failed,
    pending_orders: pending,
    success_rate: Math.round(successRate * 100) / 100,
    top_products: topProducts,
    daily_stats: dailyStatsArray,
    recent_requests: recentRequests,
    conversion_metrics: {
      day5_emails_sent: day5EmailsCount,
      replacement_requests: totalRequests,
      conversion_rate: Math.round(conversionRate * 100) / 100
    }
  };
}
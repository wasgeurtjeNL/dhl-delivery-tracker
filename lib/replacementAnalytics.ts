// lib/replacementAnalytics.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ReplacementAnalyticsEvent = 
  | 'page_visit'
  | 'product_view'
  | 'product_select'
  | 'order_attempt'
  | 'order_success';

export interface ReplacementAnalyticsParams {
  trackingCode: string;
  customerEmail?: string;
  eventType: ReplacementAnalyticsEvent;
  productId?: number;
  productName?: string;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  additionalData?: Record<string, any>;
}

/**
 * Log a replacement page analytics event
 */
export async function logReplacementEvent(params: ReplacementAnalyticsParams): Promise<void> {
  try {
    await supabase
      .from('replacement_page_analytics')
      .insert({
        tracking_code: params.trackingCode,
        customer_email: params.customerEmail,
        event_type: params.eventType,
        product_id: params.productId,
        product_name: params.productName,
        session_id: params.sessionId,
        user_agent: params.userAgent,
        ip_address: params.ipAddress,
        additional_data: params.additionalData
      });

    console.log(`📊 Replacement Analytics: ${params.eventType} for ${params.trackingCode}${params.productId ? ` (Product: ${params.productId})` : ''}`);

  } catch (error) {
    console.error('❌ Failed to log replacement analytics event:', error);
    // Don't throw error to prevent disrupting main flow
  }
}

/**
 * Get replacement analytics summary
 */
export async function getReplacementAnalytics(days: number = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get conversion funnel data
    const { data: funnelData, error: funnelError } = await supabase
      .from('replacement_conversion_funnel')
      .select('*')
      .gte('conversion_date', startDate.toISOString().split('T')[0])
      .order('conversion_date', { ascending: false });

    if (funnelError) {
      console.error('Error fetching conversion funnel:', funnelError);
      return null;
    }

    // Get top products
    const { data: topProducts, error: topProductsError } = await supabase
      .from('replacement_page_analytics')
      .select('product_id, product_name')
      .eq('event_type', 'order_success')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (topProductsError) {
      console.error('Error fetching top products:', topProductsError);
    }

    // Count product popularity
    const productCounts = topProducts?.reduce((acc: Record<string, any>, item) => {
      const key = `${item.product_id}-${item.product_name}`;
      if (!acc[key]) {
        acc[key] = {
          product_id: item.product_id,
          product_name: item.product_name,
          count: 0
        };
      }
      acc[key].count++;
      return acc;
    }, {}) || {};

    const sortedProducts = Object.values(productCounts)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 10);

    return {
      conversionFunnel: funnelData,
      topProducts: sortedProducts,
      period: `${days} days`
    };

  } catch (error) {
    console.error('❌ Error getting replacement analytics:', error);
    return null;
  }
}

/**
 * Generate session ID for tracking user journey
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract user info from request headers
 */
export function extractUserInfo(req: any) {
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ipAddress = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection?.remoteAddress || 
                   req.socket?.remoteAddress ||
                   'Unknown';

  return {
    userAgent,
    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress
  };
}
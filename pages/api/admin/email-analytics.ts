// pages/api/admin/email-analytics.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EmailStats {
  total_sent: number;
  successful: number;
  failed: number;
  success_rate: number;
  templates: {
    [key: string]: {
      sent: number;
      successful: number;
      failed: number;
      success_rate: number;
    };
  };
  daily_stats: {
    date: string;
    sent: number;
    successful: number;
    failed: number;
  }[];
  recent_failures: {
    template_type: string;
    recipient_email: string;
    error_message: string;
    sent_at: string;
  }[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { period = '7d' } = req.query;

    console.log(`📊 Generating email analytics for period: ${period}`);

    const stats = await generateEmailAnalytics(period as string);

    return res.status(200).json({
      success: true,
      period,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Email analytics generation failed:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate email analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function generateEmailAnalytics(period: string): Promise<EmailStats> {
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '1d':
      startDate.setDate(endDate.getDate() - 1);
      break;
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
      startDate.setDate(endDate.getDate() - 7);
  }

  // Get all email logs for the period
  const { data: emailLogs, error } = await supabase
    .from('email_logs')
    .select('*')
    .gte('sent_at', startDate.toISOString())
    .lte('sent_at', endDate.toISOString())
    .order('sent_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch email logs: ${error.message}`);
  }

  // Calculate overall stats
  const totalSent = emailLogs.length;
  const successful = emailLogs.filter(log => !log.error_message).length;
  const failed = emailLogs.filter(log => log.error_message).length;
  const successRate = totalSent > 0 ? (successful / totalSent) * 100 : 0;

  // Calculate stats per template
  const templateStats: { [key: string]: any } = {};
  const templateTypes = [...new Set(emailLogs.map(log => log.template_type))];

  for (const templateType of templateTypes) {
    const templateLogs = emailLogs.filter(log => log.template_type === templateType);
    const templateSent = templateLogs.length;
    const templateSuccessful = templateLogs.filter(log => !log.error_message).length;
    const templateFailed = templateLogs.filter(log => log.error_message).length;
    const templateSuccessRate = templateSent > 0 ? (templateSuccessful / templateSent) * 100 : 0;

    templateStats[templateType] = {
      sent: templateSent,
      successful: templateSuccessful,
      failed: templateFailed,
      success_rate: Math.round(templateSuccessRate * 100) / 100
    };
  }

  // Calculate daily stats
  const dailyStats: { [key: string]: any } = {};
  
  for (const log of emailLogs) {
    const date = new Date(log.sent_at).toISOString().split('T')[0];
    
    if (!dailyStats[date]) {
      dailyStats[date] = {
        date,
        sent: 0,
        successful: 0,
        failed: 0
      };
    }
    
    dailyStats[date].sent++;
    if (log.error_message) {
      dailyStats[date].failed++;
    } else {
      dailyStats[date].successful++;
    }
  }

  const dailyStatsArray = Object.values(dailyStats).sort((a: any, b: any) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Get recent failures
  const recentFailures = emailLogs
    .filter(log => log.error_message)
    .slice(0, 10)
    .map(log => ({
      template_type: log.template_type,
      recipient_email: log.recipient_email,
      error_message: log.error_message,
      sent_at: log.sent_at
    }));

  return {
    total_sent: totalSent,
    successful,
    failed,
    success_rate: Math.round(successRate * 100) / 100,
    templates: templateStats,
    daily_stats: dailyStatsArray,
    recent_failures: recentFailures
  };
}

// Additional endpoint for Mandrill webhook handling (optional future feature)
export async function handleMandrillWebhook(req: NextApiRequest, res: NextApiResponse) {
  try {
    // This would handle Mandrill webhooks for real-time email events
    // like opens, clicks, bounces, etc.
    const events = req.body;
    
    console.log('📧 Received Mandrill webhook events:', events.length);
    
    // Process each event and update our email_logs table
    for (const event of events) {
      // Update email log with delivery status, opens, clicks, etc.
      // This is an advanced feature for future implementation
    }

    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('❌ Webhook processing failed:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
} 
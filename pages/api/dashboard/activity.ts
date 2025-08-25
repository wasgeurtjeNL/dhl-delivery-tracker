// pages/api/dashboard/activity.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    
    // Haal recente logs op met joins voor extra info
    const { data: recentLogs, error } = await supabase
      .from('tracking_logs')
      .select(`
        id,
        tracking_code,
        order_id,
        email,
        action_type,
        details,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    // Format activities met emoji's en beschrijvingen
    const activities = recentLogs?.map(log => {
      const time = new Date(log.created_at).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit'
      });

      let emoji = '📋';
      let description = '';
      let type = 'info';

      switch (log.action_type) {
        case 'heads_up_sent':
          emoji = '📧';
          description = `Dag 3 heads-up email verzonden naar ${log.email}`;
          type = 'email';
          break;
        
        case 'choice_sent':
          emoji = '🎯';
          description = `Dag 5 keuze email verzonden naar ${log.email}`;
          type = 'email';
          break;
        
        case 'gift_notice_sent':
          emoji = '🎁';
          description = `Dag 10 compensatie email verzonden naar ${log.email}`;
          type = 'email';
          break;
        
        case 'customer_choice':
          const choice = log.details?.keuze;
          const choiceText = {
            'new_bottle': 'nieuwe fles',
            'received': 'toch ontvangen',
            'wait': 'nog even wachten'
          }[choice] || choice;
          emoji = '👤';
          description = `Klant koos "${choiceText}" voor order #${log.order_id}`;
          type = 'customer';
          break;
        
        case 'processing_error':
          emoji = '❌';
          description = `Error bij verwerken ${log.tracking_code}: ${log.details?.error || 'Unknown error'}`;
          type = 'error';
          break;
        
        default:
          description = `${log.action_type} voor ${log.tracking_code}`;
      }

      return {
        id: log.id,
        time,
        emoji,
        description,
        type,
        trackingCode: log.tracking_code,
        orderId: log.order_id,
        details: log.details
      };
    }) || [];

    res.status(200).json({
      activities,
      total: activities.length,
      lastUpdate: new Date().toISOString()
    });

  } catch (error) {
    console.error('Activity feed error:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
} 
// pages/api/dashboard/stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { differenceInCalendarDays } from 'date-fns';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Haal systeem instellingen op voor dynamische timing
    const { data: settings } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .single();

    const timingSettings = settings || { 
      day_3_timing: 3, 
      day_5_timing: 5, 
      day_10_timing: 10,
      emergency_stop: false 
    };

    // Parallelle queries voor performance
    const [
      { data: allTrackings },
      { data: todayEmails },
      { data: recentErrors },
      { data: customerResponses },
      { data: deliveryStats }
    ] = await Promise.all([
      // Alle trackings voor actieve berekening
      supabase
        .from('tracking_matches')
        .select('id, created_at, is_active, delivery_status'),

      // Emails verzonden vandaag
      supabase
        .from('tracking_logs')
        .select('id')
        .in('action_type', ['heads_up_sent', 'choice_sent', 'gift_notice_sent'])
        .gte('created_at', new Date().toISOString().split('T')[0])
        .then(({ data }) => ({ data: data?.length || 0 })),

      // Errors laatste 24 uur
      supabase
        .from('tracking_logs')
        .select('id')
        .eq('action_type', 'processing_error')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => ({ data: data?.length || 0 })),

      // Customer responses (laatste week)
      supabase
        .from('tracking_logs')
        .select('details')
        .eq('action_type', 'customer_choice')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

      // Delivery success rate (laatste 30 dagen)
      supabase
        .from('tracking_logs')
        .select('action_type')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ]);

    // Bereken actieve trackings met nieuwe logica
    const today = new Date();
    let activeTrackings = 0;
    let needsActionCount = 0;

    if (allTrackings) {
      for (const tracking of allTrackings) {
        const dagenOnderweg = differenceInCalendarDays(today, new Date(tracking.created_at));
        const isDelivered = tracking.delivery_status === 'bezorgd';
        const isActive = tracking.is_active && !isDelivered;
        
        if (isActive) {
          activeTrackings++;
          
          // Check of actie nodig is op basis van timing settings
          if (dagenOnderweg >= timingSettings.day_3_timing) {
            needsActionCount++;
          }
        }
      }
    }

    // Verwerk customer response data
    const responseBreakdown = customerResponses?.reduce((acc: any, log: any) => {
      const choice = log.details?.keuze;
      if (choice) {
        acc[choice] = (acc[choice] || 0) + 1;
      }
      return acc;
    }, {}) || {};

    // Bereken success rate
    const totalProcessed = deliveryStats?.length || 0;
    const errors = deliveryStats?.filter((log: any) => log.action_type === 'processing_error').length || 0;
    const successRate = totalProcessed > 0 ? ((totalProcessed - errors) / totalProcessed * 100) : 100;

    // Response rate berekenen
    const totalChoiceEmails = deliveryStats?.filter((log: any) => log.action_type === 'choice_sent').length || 0;
    const totalResponses = Object.values(responseBreakdown).reduce((sum: number, count: any) => sum + Number(count), 0);
    const responseRate = totalChoiceEmails > 0 ? (Number(totalResponses) / totalChoiceEmails * 100) : 0;

    // System status
    const systemStatus = settings?.emergency_stop ? 'emergency_stop' : 'operational';

    res.status(200).json({
      kpis: {
        activeTrackings,
        needsAction: needsActionCount,
        emailsToday: todayEmails,
        successRate: parseFloat(successRate.toFixed(1)),
        responseRate: parseFloat(responseRate.toFixed(1))
      },
      errors: {
        recent: recentErrors,
        trend: 'stable' // TODO: Compare with previous period
      },
      customerResponses: {
        breakdown: responseBreakdown,
        total: totalResponses
      },
      system: {
        status: systemStatus,
        timingSettings: {
          day3: timingSettings.day_3_timing,
          day5: timingSettings.day_5_timing,
          day10: timingSettings.day_10_timing
        },
        emergencyStop: settings?.emergency_stop || false
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
} 
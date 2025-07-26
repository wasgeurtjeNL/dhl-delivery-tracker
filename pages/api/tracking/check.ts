// pages/api/tracking/check.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { scrapeDHL } from '@/lib/scrapeDHL';
import { differenceInCalendarDays } from 'date-fns';
import { sendMandrillEmail } from '@/lib/sendMandrillMail';
import { logTrackingAction } from '@/lib/logTrackingAction';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkIfAlreadyLogged(trackingCode: string, actionType: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('tracking_logs')
      .select('id')
      .eq('tracking_code', trackingCode)
      .eq('action_type', actionType)
      .limit(1);
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking if already logged:', error);
    return false; // Als er een fout is, ga door met versturen (veiliger)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Haal systeem instellingen op
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .single();

    if (settingsError) {
      console.error('Failed to fetch system settings:', settingsError);
      return res.status(500).json({ error: 'Kon systeem instellingen niet ophalen' });
    }

    // Check emergency stop
    if (settings.emergency_stop) {
      console.log('🚨 Emergency stop is active - skipping tracking check');
      return res.status(200).json({ 
        status: 'Emergency stop active', 
        message: 'Automated emails are paused'
      });
    }

    const { data: matches, error } = await supabase
      .from('tracking_matches')
      .select('*')
      .eq('is_active', true);

    if (error || !matches) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Kon tracking_matches niet ophalen' });
    }

    console.log(`🔍 Start tracking check voor ${matches.length} pakketten`);
    console.log(`⚙️ Settings: Day ${settings.day_3_timing}/${settings.day_5_timing}/${settings.day_10_timing}`);
    let successCount = 0;
    let errorCount = 0;

    for (const match of matches) {
      try {
        const { tracking_code, email, first_name, created_at, order_id } = match;

        const result = await scrapeDHL(tracking_code);
        const today = new Date();

        const verzendMoment = new Date(created_at);
        const dagenOnderweg = differenceInCalendarDays(today, verzendMoment);

        console.log(`📦 ${tracking_code} → Status: ${result.deliveryStatus} | ${dagenOnderweg} dagen onderweg`);

        // Update delivery status, duration info en active status in database
        const updateData: any = {
          delivery_status: result.deliveryStatus,
          last_status_check: today.toISOString(),
          last_scraped_at: today.toISOString(),
          is_active: result.deliveryStatus !== 'bezorgd' // Deactiveer als bezorgd
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

        await supabase
          .from('tracking_matches')
          .update(updateData)
          .eq('tracking_code', tracking_code);

        // Log duration calculation if we have the data
        if (result.duration && result.durationDays) {
          await logTrackingAction({
            tracking_code,
            order_id,
            email,
            action_type: 'duration_calculated',
            details: {
              delivery_status: result.deliveryStatus,
              aflever_moment: result.afleverMoment?.toISOString(),
              afgegeven_moment: result.afgegevenMoment?.toISOString(),
              duration: result.duration,
              duration_days: result.durationDays,
              dagen_onderweg: dagenOnderweg,
              scraping_method: 'enhanced_dhl_parser'
            }
          });
          console.log(`⏱️ Duration berekend voor ${tracking_code}: ${result.duration} (${result.durationDays} dagen)`);
        }

    // Configureerbare dag timing - Heads-up
    if (dagenOnderweg === settings.day_3_timing && result.deliveryStatus !== 'bezorgd') {
      const alreadySentHeadsUp = await checkIfAlreadyLogged(tracking_code, 'heads_up_sent');
      
      if (!alreadySentHeadsUp) {
        await sendMandrillEmail({
          to: { email, name: first_name },
          templateName: settings.email_template_day3,
          mergeVars: { first_name, order_id, tracking_code }
        });

        await logTrackingAction({
          tracking_code,
          order_id,
          email,
          action_type: 'heads_up_sent',
          details: { dagenOnderweg, deliveryStatus: result.deliveryStatus, configuredDay: settings.day_3_timing }
        });

        console.log(`📧 Dag ${settings.day_3_timing} e-mail verzonden naar ${email} voor ${tracking_code}`);
      } else {
        console.log(`⏭️ Dag ${settings.day_3_timing} e-mail al verzonden voor ${tracking_code}`);
      }
    }

    // Configureerbare dag timing - Keuze e-mail
    if (dagenOnderweg === settings.day_5_timing && result.deliveryStatus !== 'bezorgd') {
      const alreadySentChoice = await checkIfAlreadyLogged(tracking_code, 'choice_sent');
      
      if (!alreadySentChoice) {
        await sendMandrillEmail({
          to: { email, name: first_name },
          templateName: settings.email_template_day5,
          mergeVars: {
            first_name,
            order_id,
            button_url_1: `https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=${order_id}`,
            button_url_2: `https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=${order_id}`,
            button_url_3: `https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=${order_id}`,
          }
        });

        await logTrackingAction({
          tracking_code,
          order_id,
          email,
          action_type: 'choice_sent',
          details: { dagenOnderweg, configuredDay: settings.day_5_timing }
        });

        console.log(`📧 Dag ${settings.day_5_timing} keuze e-mail verzonden naar ${email} voor ${tracking_code}`);
      } else {
        console.log(`⏭️ Dag ${settings.day_5_timing} e-mail al verzonden voor ${tracking_code}`);
      }
    }

    // Configureerbare dag timing - Gift notice
    if (dagenOnderweg === settings.day_10_timing && result.deliveryStatus !== 'bezorgd') {
      const alreadySentGift = await checkIfAlreadyLogged(tracking_code, 'gift_notice_sent');
      
      if (!alreadySentGift) {
        await sendMandrillEmail({
          to: { email, name: first_name },
          templateName: settings.email_template_day10,
          mergeVars: { first_name, order_id }
        });

        await logTrackingAction({
          tracking_code,
          order_id,
          email,
          action_type: 'gift_notice_sent',
          details: { dagenOnderweg, configuredDay: settings.day_10_timing }
        });

        console.log(`📧 Dag ${settings.day_10_timing} gift notice verzonden naar ${email} voor ${tracking_code}`);
      } else {
        console.log(`⏭️ Dag ${settings.day_10_timing} e-mail al verzonden voor ${tracking_code}`);
      }
    }

        if (result.deliveryStatus === 'bezorgd') {
          console.log(`✅ Afgeleverd! Tracking ${tracking_code} wordt gedeactiveerd`);
          
          // Deactiveer tracking definitief bij aflevering
          await supabase
            .from('tracking_matches')
            .update({
              is_active: false,
              delivery_status: 'bezorgd'
            })
            .eq('tracking_code', tracking_code);
        }

        successCount++;
      } catch (error) {
        console.error(`❌ Fout bij verwerken ${match.tracking_code}:`, error);
        errorCount++;
        
        // Log de fout naar Supabase voor monitoring
        try {
          await logTrackingAction({
            tracking_code: match.tracking_code,
            order_id: match.order_id?.toString() || 'unknown',
            email: match.email,
            action_type: 'processing_error',
            details: { 
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          });
        } catch (logError) {
          console.error('Kon error niet loggen:', logError);
        }
      }
    }

    console.log(`✅ Tracking check voltooid: ${successCount} success, ${errorCount} errors`);
    res.status(200).json({ 
      status: 'Check uitgevoerd', 
      total: matches.length,
      success: successCount,
      errors: errorCount
    });

  } catch (error) {
    console.error('Critical error in tracking check:', error);
    res.status(500).json({ 
      error: 'Critical error during tracking check',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}


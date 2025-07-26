// pages/api/tracking/check-pausable.ts
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

// In-memory store voor check status (in productie zou dit in database/cache moeten)
const checkSessions: Map<string, {
  id: string;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  currentIndex: number;
  totalItems: number;
  successCount: number;
  errorCount: number;
  startTime: number;
  matches: any[];
  settings: any;
  results: any[];
}> = new Map();

// Functie om unieke session ID te genereren
function generateSessionId(): string {
  return `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { action, sessionId } = req.query;

  try {
    if (action === 'start') {
      // Start nieuwe check sessie
      const { data: settings, error: settingsError } = await supabase
        .from('system_settings')
        .select('*')
        .limit(1)
        .single();

      if (settingsError) {
        return res.status(500).json({ error: 'Kon systeem instellingen niet ophalen' });
      }

      if (settings.emergency_stop) {
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
        return res.status(500).json({ error: 'Kon tracking_matches niet ophalen' });
      }

      const newSessionId = generateSessionId();
      const session = {
        id: newSessionId,
        status: 'running' as const,
        currentIndex: 0,
        totalItems: matches.length,
        successCount: 0,
        errorCount: 0,
        startTime: Date.now(),
        matches,
        settings,
        results: []
      };

      checkSessions.set(newSessionId, session);

      // Start processing (non-blocking)
      processCheckSession(newSessionId);

      return res.status(200).json({
        sessionId: newSessionId,
        status: 'started',
        totalItems: matches.length
      });

    } else if (action === 'pause' && sessionId) {
      // Pauzeer check sessie
      const session = checkSessions.get(sessionId as string);
      if (session) {
        session.status = 'paused';
        return res.status(200).json({ status: 'paused', sessionId });
      }
      return res.status(404).json({ error: 'Session not found' });

    } else if (action === 'resume' && sessionId) {
      // Hervat check sessie
      const session = checkSessions.get(sessionId as string);
      if (session) {
        session.status = 'running';
        // Continue processing
        processCheckSession(sessionId as string);
        return res.status(200).json({ status: 'resumed', sessionId });
      }
      return res.status(404).json({ error: 'Session not found' });

    } else if (action === 'stop' && sessionId) {
      // Stop check sessie
      const session = checkSessions.get(sessionId as string);
      if (session) {
        session.status = 'stopped';
        return res.status(200).json({ 
          status: 'stopped', 
          sessionId,
          finalStats: {
            processed: session.currentIndex,
            total: session.totalItems,
            success: session.successCount,
            errors: session.errorCount
          }
        });
      }
      return res.status(404).json({ error: 'Session not found' });

    } else if (action === 'status' && sessionId) {
      // Haal status op
      const session = checkSessions.get(sessionId as string);
      if (session) {
        return res.status(200).json({
          sessionId,
          status: session.status,
          progress: {
            current: session.currentIndex,
            total: session.totalItems,
            percentage: Math.round((session.currentIndex / session.totalItems) * 100),
            success: session.successCount,
            errors: session.errorCount,
            elapsed: Math.round((Date.now() - session.startTime) / 1000),
            remaining: session.totalItems - session.currentIndex
          },
          results: session.results.slice(-5) // Laatste 5 resultaten
        });
      }
      return res.status(404).json({ error: 'Session not found' });

    } else {
      return res.status(400).json({ error: 'Invalid action or missing sessionId' });
    }

  } catch (error) {
    console.error('Critical error in pausable tracking check:', error);
    return res.status(500).json({ 
      error: 'Critical error during tracking check',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Asynchrone processing functie
async function processCheckSession(sessionId: string) {
  const session = checkSessions.get(sessionId);
  if (!session) return;

  console.log(`🔍 Start/Resume tracking check session ${sessionId} - ${session.totalItems} pakketten`);

  while (session.currentIndex < session.totalItems && session.status === 'running') {
    const match = session.matches[session.currentIndex];
    
    try {
      const { tracking_code, email, first_name, created_at, order_id } = match;
      
      // Log start van deze processing
      const result = await scrapeDHL(tracking_code);
      const today = new Date();
      const verzendMoment = new Date(created_at);
      const dagenOnderweg = differenceInCalendarDays(today, verzendMoment);

      console.log(`📦 [${session.currentIndex + 1}/${session.totalItems}] ${tracking_code} → ${result.deliveryStatus} | ${dagenOnderweg} dagen`);

      // Update delivery status
      await supabase
        .from('tracking_matches')
        .update({
          delivery_status: result.deliveryStatus,
          last_status_check: today.toISOString(),
          is_active: result.deliveryStatus !== 'bezorgd'
        })
        .eq('tracking_code', tracking_code);

      // Email logic (copied from original check.ts)
      const settings = session.settings;
      
      // Day 3 timing
      if (dagenOnderweg === settings.day_3_timing && result.deliveryStatus !== 'bezorgd') {
        const alreadySentHeadsUp = await checkIfAlreadyLogged(tracking_code, 'heads_up_sent');
        
        if (!alreadySentHeadsUp) {
          await sendMandrillEmail({
            to: { email, name: first_name },
            templateName: settings.email_template_day3,
            mergeVars: { first_name, order_id, tracking_code }
          });

          await logTrackingAction({
            tracking_code, order_id, email,
            action_type: 'heads_up_sent',
            details: { dagenOnderweg, deliveryStatus: result.deliveryStatus, configuredDay: settings.day_3_timing }
          });
        }
      }

      // Day 5 timing
      if (dagenOnderweg === settings.day_5_timing && result.deliveryStatus !== 'bezorgd') {
        const alreadySentChoice = await checkIfAlreadyLogged(tracking_code, 'choice_sent');
        
        if (!alreadySentChoice) {
          await sendMandrillEmail({
            to: { email, name: first_name },
            templateName: settings.email_template_day5,
            mergeVars: {
              first_name, order_id,
              button_url_1: `https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=${order_id}`,
              button_url_2: `https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=${order_id}`,
              button_url_3: `https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=${order_id}`,
            }
          });

          await logTrackingAction({
            tracking_code, order_id, email,
            action_type: 'choice_sent',
            details: { dagenOnderweg, configuredDay: settings.day_5_timing }
          });
        }
      }

      // Day 10 timing
      if (dagenOnderweg === settings.day_10_timing && result.deliveryStatus !== 'bezorgd') {
        const alreadySentGift = await checkIfAlreadyLogged(tracking_code, 'gift_notice_sent');
        
        if (!alreadySentGift) {
          await sendMandrillEmail({
            to: { email, name: first_name },
            templateName: settings.email_template_day10,
            mergeVars: { first_name, order_id }
          });

          await logTrackingAction({
            tracking_code, order_id, email,
            action_type: 'gift_notice_sent',
            details: { dagenOnderweg, configuredDay: settings.day_10_timing }
          });
        }
      }

      // Deactiveer bij bezorging
      if (result.deliveryStatus === 'bezorgd') {
        await supabase
          .from('tracking_matches')
          .update({ is_active: false, delivery_status: 'bezorgd' })
          .eq('tracking_code', tracking_code);
      }

      session.successCount++;
      session.results.push({
        tracking_code,
        status: 'success',
        deliveryStatus: result.deliveryStatus,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Fout bij verwerken ${match.tracking_code}:`, error);
      session.errorCount++;
      session.results.push({
        tracking_code: match.tracking_code,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      // Log error
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

    session.currentIndex++;

    // Korte pauze tussen items om UI updates toe te staan
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Check voltooid of gestopt
  if (session.status === 'running') {
    session.status = 'completed';
    console.log(`✅ Tracking check session ${sessionId} voltooid: ${session.successCount} success, ${session.errorCount} errors`);
  }

  // Clean up na 5 minuten
  setTimeout(() => {
    checkSessions.delete(sessionId);
  }, 5 * 60 * 1000);
}
// pages/api/dashboard/trackings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { differenceInCalendarDays } from 'date-fns';
import { scrapeDHL } from '@/lib/scrapeDHL';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = (page - 1) * limit;
    const filterActive = req.query.active !== 'false';
    
    // Nieuwe zoek en filter parameters
    const search = req.query.search as string || '';
    const statusFilter = req.query.status as string || '';
    const daysMin = parseInt(req.query.daysMin as string) || 0;
    const daysMax = parseInt(req.query.daysMax as string) || 999;
    const deliveryStatusFilter = req.query.deliveryStatus as string || '';
    
    // Performance parameter - skip DHL scraping for quick overview (used by main dashboard)
    const skipDhlScraping = req.query.skipDhl === 'true';

    // Haal systeem instellingen op voor dynamische timing
    const { data: settings } = await supabase
      .from('system_settings')
      .select('day_3_timing, day_5_timing, day_10_timing')
      .limit(1)
      .single();

    const timingSettings = settings || { day_3_timing: 3, day_5_timing: 5, day_10_timing: 10 };

    // Basis query met joins voor meer informatie
    let query = supabase
      .from('tracking_matches')
      .select(`
        id,
        email,
        first_name,
        last_name,
        tracking_code,
        order_id,
        created_at,
        is_active,
        delivery_status,
        last_status_check,
        batch_id,
        matched_from,
        aflever_moment,
        afgegeven_moment,
        duration,
        duration_days,
        last_scraped_at
      `)
      .order('created_at', { ascending: false });

    // Actieve filter - OPTIMIZED: exclude delivered packages from active filter
    if (filterActive) {
      query = query.eq('is_active', true).neq('delivery_status', 'bezorgd');
    }

    // Delivery status filter
    if (deliveryStatusFilter) {
      query = query.eq('delivery_status', deliveryStatusFilter);
    }

    // Zoekfunctionaliteit - zoek in meerdere velden
    if (search) {
      query = query.or(
        `email.ilike.%${search}%,` +
        `first_name.ilike.%${search}%,` +
        `last_name.ilike.%${search}%,` +
        `tracking_code.ilike.%${search}%,` +
        `order_id.eq.${isNaN(parseInt(search)) ? 0 : parseInt(search)},` +
        `batch_id.ilike.%${search}%`
      );
    }

    const { data: trackings, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // Functie voor gebruiksvriendelijke tijd weergave
    const formatTimeUnderweg = (startMoment: Date, endMoment: Date): string => {
      const totalMinutes = Math.floor((endMoment.getTime() - startMoment.getTime()) / (1000 * 60));
      const totalHours = Math.floor(totalMinutes / 60);
      const totalDays = Math.floor(totalHours / 24);
      
      if (totalHours < 6) {
        return `${totalHours} uur onderweg`;
      } else if (totalHours < 24) {
        return `${totalHours} uur onderweg`;
      } else if (totalDays <= 2) {
        const remainingHours = totalHours % 24;
        if (remainingHours === 0) {
          return `${totalDays} ${totalDays === 1 ? 'dag' : 'dagen'} onderweg`;
        } else {
          return `${totalDays} ${totalDays === 1 ? 'dag' : 'dagen'} ${remainingHours} uur onderweg`;
        }
      } else {
        return `${totalDays} dagen onderweg`;
      }
    };

    // Voor elke tracking, haal de laatste logs op en bereken informatie
    const enrichedTrackings = await Promise.all(
      trackings?.map(async (tracking, index) => {
        const today = new Date();
        const verzendMoment = new Date(tracking.created_at);
        
        // Haal laatste logs op voor deze tracking (eerst declareren voor gebruik)
        const { data: logs } = await supabase
          .from('tracking_logs')
          .select('action_type, created_at, details')
          .eq('tracking_code', tracking.tracking_code)
          .order('created_at', { ascending: false })
          .limit(5);

        // FIX: Stop met tellen als pakket bezorgd is
        const packageDelivered = tracking.delivery_status === 'bezorgd' || 
          logs?.some(log => log.action_type === 'customer_choice' && log.details?.keuze === 'ontvangen');
        const eindMoment = packageDelivered && tracking.aflever_moment ? 
          new Date(tracking.aflever_moment) : today;
        
        // Nieuwe gebruiksvriendelijke tijd berekening
        const tijdOnderweg = formatTimeUnderweg(verzendMoment, eindMoment);
        const dagenOnderwegNumber = Math.floor((eindMoment.getTime() - verzendMoment.getTime()) / (1000 * 60 * 60 * 24));

        // OPTIMIZED: Use stored duration information from database - ONLY scrape when explicitly requested
        let dhlInfo = null;
        
        // Always try to use stored duration data from database first
        if (tracking.duration || tracking.aflever_moment || tracking.afgegeven_moment || tracking.delivery_status) {
          dhlInfo = {
            deliveryStatus: tracking.delivery_status || 'onderweg',
            afleverMoment: tracking.aflever_moment ? new Date(tracking.aflever_moment) : null,
            afgegevenMoment: tracking.afgegeven_moment ? new Date(tracking.afgegeven_moment) : null,
            duration: tracking.duration || (tracking.delivery_status === 'bezorgd' ? 'Onbekende doorlooptijd (bezorgd)' : 'Nog onderweg'),
            durationDays: tracking.duration_days || undefined,
            statusTabel: []
          };
        }
        
        // Only scrape when explicitly requested (skipDhlScraping = false) AND conditions are met
        if (!dhlInfo && !skipDhlScraping) {
          // Check if recently scraped (within last hour) to avoid unnecessary scraping
          const lastScraped = tracking.last_scraped_at ? new Date(tracking.last_scraped_at) : null;
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const wasRecentlyScraped = lastScraped && lastScraped > oneHourAgo;
          
          try {
            // STRICT CONDITIONS: Only scrape if active, not delivered, and not recently scraped
            if (tracking.is_active && 
                tracking.delivery_status !== 'bezorgd' && 
                !wasRecentlyScraped) {
              
              console.log(`🔄 Scraping ${tracking.tracking_code} (last scraped: ${lastScraped ? lastScraped.toLocaleString() : 'never'})`);
              dhlInfo = await scrapeDHL(tracking.tracking_code);
              
              // Update database with fresh scraping result
              if (dhlInfo && dhlInfo.deliveryStatus !== 'fout') {
                const updateData: any = {
                  delivery_status: dhlInfo.deliveryStatus,
                  last_scraped_at: new Date().toISOString(),
                  is_active: dhlInfo.deliveryStatus !== 'bezorgd'
                };
                
                if (dhlInfo.afleverMoment) updateData.aflever_moment = dhlInfo.afleverMoment.toISOString();
                if (dhlInfo.afgegevenMoment) updateData.afgegeven_moment = dhlInfo.afgegevenMoment.toISOString();
                if (dhlInfo.duration) updateData.duration = dhlInfo.duration;
                if (dhlInfo.durationDays) updateData.duration_days = dhlInfo.durationDays;
                
                await supabase
                  .from('tracking_matches')
                  .update(updateData)
                  .eq('tracking_code', tracking.tracking_code);
              }
            } else {
              // Skip scraping with reason
              const skipReason = tracking.delivery_status === 'bezorgd' ? 'already delivered' :
                               !tracking.is_active ? 'inactive' :
                               wasRecentlyScraped ? `recently scraped (${lastScraped?.toLocaleTimeString()})` : 'unknown';
              console.log(`⏭️ Skipping scrape for ${tracking.tracking_code}: ${skipReason}`);
            }
          } catch (error) {
            console.error(`❌ Error scraping DHL for ${tracking.tracking_code}:`, error);
            dhlInfo = {
              deliveryStatus: 'fout',
              afleverMoment: null,
              afgegevenMoment: null,
              duration: 'Kan niet bepaald worden (scraping fout)',
              durationDays: undefined,
              statusTabel: []
            };
          }
        }
        
        // Fallback for no duration info available
        if (!dhlInfo) {
          dhlInfo = {
            deliveryStatus: tracking.delivery_status || 'onderweg',
            afleverMoment: null,
            afgegevenMoment: null,
            duration: tracking.delivery_status === 'bezorgd' ? 'Onbekende doorlooptijd (bezorgd)' : 'Data ophalen...',
            durationDays: undefined,
            statusTabel: []
          };
        }

        // FIX: Bepaal status - PRIORITEIT aan echte DHL status
        let status = 'OK';
        let statusColor = 'green';
        let lastAction = 'Geen actie';
        let needsAction = false;

        // PRIORITEIT 1: Gebruik echte DHL status als beschikbaar
        if (dhlInfo && dhlInfo.deliveryStatus && dhlInfo.deliveryStatus !== 'fout') {
          switch (dhlInfo.deliveryStatus) {
            case 'bezorgd':
              status = 'Bezorgd';
              statusColor = 'green';
              needsAction = false;
              lastAction = 'Pakket bezorgd';
              break;
            case 'onderweg':
              status = 'Onderweg';
              statusColor = 'blue';
              needsAction = dagenOnderwegNumber >= timingSettings.day_5_timing;
              lastAction = 'In transport bij DHL';
              break;
            case 'verwerkt':
              status = 'Wacht op ophaling';
              statusColor = 'yellow';
              needsAction = dagenOnderwegNumber >= timingSettings.day_3_timing;
              lastAction = 'Wacht op DHL ophaling';
              break;
            case 'niet gevonden':
              status = 'Niet gevonden';
              statusColor = 'red';
              needsAction = true;
              lastAction = 'Tracking niet gevonden';
              break;
            default:
              status = 'Onbekend';
              statusColor = 'gray';
              needsAction = true;
              lastAction = 'Status onbekend';
          }
        } else {
          // PRIORITEIT 2: Email/customer action logs
          if (logs && logs.length > 0) {
            const latestLog = logs[0];
            
            switch (latestLog.action_type) {
              case 'heads_up_sent':
                lastAction = `Dag ${timingSettings.day_3_timing} email verzonden`;
                status = dagenOnderwegNumber >= timingSettings.day_5_timing ? 'Actie nodig' : 'Gemonitord';
                statusColor = dagenOnderwegNumber >= timingSettings.day_5_timing ? 'orange' : 'blue';
                needsAction = dagenOnderwegNumber >= timingSettings.day_5_timing;
                break;
              case 'choice_sent':
                lastAction = `Dag ${timingSettings.day_5_timing} keuze email verzonden`;
                status = 'Wacht op reactie';
                statusColor = 'blue';
                needsAction = dagenOnderwegNumber >= timingSettings.day_10_timing;
                break;
              case 'gift_notice_sent':
                lastAction = `Dag ${timingSettings.day_10_timing} compensatie verzonden`;
                status = 'Afgehandeld';
                statusColor = 'green';
                needsAction = false;
                break;
              case 'customer_choice':
                const choice = latestLog.details?.keuze;
                lastAction = `Klant koos: ${choice}`;
                status = 'Klant gereageerd';
                statusColor = 'green';
                needsAction = false;
                break;
              case 'processing_error':
                lastAction = 'Error';
                status = 'Fout';
                statusColor = 'red';
                needsAction = true;
                break;
            }
          } else {
            // PRIORITEIT 3: Fallback - geen logs, bepaal op basis van dagen en timing settings
            if (dagenOnderwegNumber >= timingSettings.day_10_timing) {
              status = `Actie nodig (Dag ${timingSettings.day_10_timing})`;
              statusColor = 'red';
              needsAction = true;
            } else if (dagenOnderwegNumber >= timingSettings.day_5_timing) {
              status = `Actie nodig (Dag ${timingSettings.day_5_timing})`;
              statusColor = 'orange';
              needsAction = true;
            } else if (dagenOnderwegNumber >= timingSettings.day_3_timing) {
              status = `Actie nodig (Dag ${timingSettings.day_3_timing})`;
              statusColor = 'yellow';
              needsAction = true;
            }
          }
        }

        // Bepaal of tracking als "afgeleverd" moet worden gemarkeerd
        const isTrackingComplete = tracking.delivery_status === 'bezorgd' || 
          logs?.some(log => log.action_type === 'customer_choice' && log.details?.keuze === 'ontvangen');

        const enrichedTracking = {
          id: tracking.id,
          rowNumber: offset + index + 1,
          trackingCode: tracking.tracking_code,
          customerName: `${tracking.first_name} ${tracking.last_name}`.trim(),
          email: tracking.email,
          orderId: tracking.order_id,
          dagenOnderweg: dagenOnderwegNumber,
          tijdOnderweg,
          status,
          statusColor,
          lastAction,
          verzendDatum: verzendMoment.toLocaleDateString('nl-NL'),
          verzendTime: verzendMoment.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
          isActive: tracking.is_active && !isTrackingComplete,
          deliveryStatus: dhlInfo?.deliveryStatus || tracking.delivery_status,
          needsAction,
          logs: logs || [],
          batchId: tracking.batch_id,
          matchedFrom: tracking.matched_from,
          lastStatusCheck: tracking.last_status_check ? new Date(tracking.last_status_check).toLocaleDateString('nl-NL') : 'Nooit',
          // DHL scraping informatie
          dhlInfo: dhlInfo ? {
            afleverMoment: dhlInfo.afleverMoment ? dhlInfo.afleverMoment.toLocaleString('nl-NL', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : null,
            afgegevenMoment: dhlInfo.afgegevenMoment ? dhlInfo.afgegevenMoment.toLocaleString('nl-NL', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : null,
            duration: dhlInfo.duration,
            durationDays: dhlInfo.durationDays,
            deliveryStatus: dhlInfo.deliveryStatus,
            statusTabel: dhlInfo.statusTabel
          } : null
        };

        return enrichedTracking;
      }) || []
    );

    // Filter op dagen onderweg (na enrichment omdat we de berekende waarde nodig hebben)
    const filteredTrackings = enrichedTrackings.filter(t => 
      t.dagenOnderweg >= daysMin && t.dagenOnderweg <= daysMax &&
      (statusFilter === '' || t.status.toLowerCase().includes(statusFilter.toLowerCase())) &&
      (search === '' || t.customerName.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase()) || t.trackingCode.toLowerCase().includes(search.toLowerCase()) || t.orderId.toString().includes(search))
    );

    // Voor accurate paginatie tellen we met dezelfde filters
    let countQuery = supabase
      .from('tracking_matches')
      .select('id', { count: 'exact', head: true });

    if (filterActive) {
      countQuery = countQuery.eq('is_active', true).neq('delivery_status', 'bezorgd');
    }

    if (deliveryStatusFilter) {
      countQuery = countQuery.eq('delivery_status', deliveryStatusFilter);
    }

    if (search) {
      countQuery = countQuery.or(
        `email.ilike.%${search}%,` +
        `first_name.ilike.%${search}%,` +
        `last_name.ilike.%${search}%,` +
        `tracking_code.ilike.%${search}%,` +
        `order_id.eq.${isNaN(parseInt(search)) ? 0 : parseInt(search)},` +
        `batch_id.ilike.%${search}%`
      );
    }

    const { count } = await countQuery;

    // Bereken statistieken
    const activeCount = filteredTrackings.filter(t => t.isActive).length;
    const needsActionCount = filteredTrackings.filter(t => t.needsAction && t.isActive).length;

    // Bereken duration statistieken
    const trackingsWithDuration = filteredTrackings.filter(t => t.dhlInfo?.durationDays);
    const avgDuration = trackingsWithDuration.length > 0 
      ? trackingsWithDuration.reduce((sum, t) => sum + (t.dhlInfo?.durationDays || 0), 0) / trackingsWithDuration.length
      : 0;
    
    const completedTrackings = filteredTrackings.filter(t => t.deliveryStatus === 'bezorgd' && t.dhlInfo?.durationDays);
    const avgCompletedDuration = completedTrackings.length > 0
      ? completedTrackings.reduce((sum, t) => sum + (t.dhlInfo?.durationDays || 0), 0) / completedTrackings.length
      : 0;

    // Database paginering is al toegepast via .range(), geen extra JavaScript paginering nodig
    res.status(200).json({
      trackings: filteredTrackings,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
        showing: filteredTrackings.length,
        filteredTotal: filteredTrackings.length
      },
      stats: {
        totalActive: activeCount,
        needsAction: needsActionCount,
        timingSettings,
        totalRecords: count || 0,
        statusBreakdown: {
          actief: filteredTrackings.filter(t => t.isActive).length,
          inactief: filteredTrackings.filter(t => !t.isActive).length,
          bezorgd: filteredTrackings.filter(t => t.deliveryStatus === 'bezorgd').length,
          onderweg: filteredTrackings.filter(t => t.deliveryStatus === 'onderweg').length,
          errors: filteredTrackings.filter(t => t.status === 'Fout').length
        },
        durationStats: {
          trackingsWithDuration: trackingsWithDuration.length,
          avgDuration: Number(avgDuration.toFixed(1)),
          avgDurationFormatted: avgDuration > 0 ? `${avgDuration.toFixed(1)} dagen` : 'Geen data',
          completedTrackings: completedTrackings.length,
          avgCompletedDuration: Number(avgCompletedDuration.toFixed(1)),
          avgCompletedDurationFormatted: avgCompletedDuration > 0 ? `${avgCompletedDuration.toFixed(1)} dagen` : 'Geen data'
        }
      },
      filters: {
        active: filterActive,
        search,
        status: statusFilter,
        daysMin,
        daysMax,
        deliveryStatus: deliveryStatusFilter
      }
    });

  } catch (error) {
    console.error('Trackings table error:', error);
    res.status(500).json({ error: 'Failed to fetch trackings' });
  }
} 
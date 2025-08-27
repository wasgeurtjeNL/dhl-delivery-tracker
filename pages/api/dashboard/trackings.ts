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
        last_scraped_at,
        dagen_onderweg,
        needs_action
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
      const searchTerms = search.trim().split(/\s+/).filter(term => term.length > 0);
      
      if (searchTerms.length > 1) {
        const firstName = searchTerms[0];
        const lastName = searchTerms.slice(1).join(' ');
        
        // Gebruik `~*` voor case-insensitive regex met `\\y` voor woordgrens (begint met)
        const nameFilter = `and(first_name.~*.\\y${firstName},last_name.~*.\\y${lastName})`;
        
        query = query.or(
          `${nameFilter},` +
          `email.ilike.%${search}%,` + // Blijf 'contains' gebruiken voor email
          `tracking_code.ilike.%${search}%`
        );
      } else {
        const searchTerm = searchTerms[0];
        // Gebruik `~*` en `\\y` voor 'begint met heel woord' voor namen
        query = query.or(
          `email.ilike.%${searchTerm}%,` +
          `first_name.~*.\\y${searchTerm},` +
          `last_name.~*.\\y${searchTerm},` +
          `tracking_code.ilike.%${searchTerm}%,` +
          `order_id.eq.${isNaN(parseInt(searchTerm)) ? 0 : parseInt(searchTerm)},` +
          `batch_id.ilike.%${searchTerm}%`
        );
      }
    }

    // Paginatie
    const startIndex = (page - 1) * limit;
    query = query.range(startIndex, startIndex + limit - 1);

    let { data: trackings, error, count } = await query;

    if (error) throw error;

    // Functie voor gebruiksvriendelijke tijd weergave
    const formatDuration = (ms: number) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days} dag${days > 1 ? 'en' : ''}`;
      if (hours > 0) return `${hours} uur`;
      return `${minutes} min`;
    };

    // Stap 1: Lichtgewicht verrijking voor filtering
    const enrichedForFiltering = trackings.map(t => {
      const dagenOnderweg = Math.floor((new Date().getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24));
      
      let status = 'OK';
      if (t.needs_action) { status = 'Actie nodig'; }
      else if (dagenOnderweg >= 10) { status = 'Actie nodig'; }
      else if (dagenOnderweg >= 5) { status = 'Gemonitord'; }
      else if (dagenOnderweg >= 3) { status = 'Waarschuwing'; }

      return {
        ...t,
        customerName: `${t.first_name || ''} ${t.last_name || ''}`.trim(),
        dagenOnderweg: dagenOnderweg,
        status: status,
      };
    });

    // Stap 2: Filteren op basis van de verrijkte data
    const filteredTrackings = enrichedForFiltering.filter(t => 
      t.dagenOnderweg >= daysMin && 
      t.dagenOnderweg <= daysMax &&
      (deliveryStatusFilter === '' || !t.delivery_status || t.delivery_status.toLowerCase().includes(deliveryStatusFilter.toLowerCase())) &&
      (statusFilter === '' || t.status.toLowerCase().includes(statusFilter.toLowerCase()))
    );

    // Stap 3: Zware verrijking (DHL info) en finale shaping, alleen op de gefilterde resultaten
    const finalTrackings = await Promise.all(
      filteredTrackings.map(async (tracking, index) => {
        const verzendMoment = new Date(tracking.created_at);
        const tijdOnderweg = formatDuration(new Date().getTime() - verzendMoment.getTime());
        
        let statusColor = 'green';
        if (tracking.status === 'Actie nodig') statusColor = 'red';
        else if (tracking.status === 'Gemonitord') statusColor = 'orange';
        else if (tracking.status === 'Waarschuwing') statusColor = 'yellow';
        
        let dhlInfo: DHLInfo | null = null;
        if (!skipDhlScraping && tracking.is_active) {
          try {
            const scrapeResult = await scrapeDHL(tracking.tracking_code);
            dhlInfo = {
              afleverMoment: scrapeResult.afleverMoment,
              afgegevenMoment: scrapeResult.afgegevenMoment,
              duration: scrapeResult.duration,
              durationDays: scrapeResult.durationDays,
              deliveryStatus: scrapeResult.deliveryStatus,
              statusTabel: scrapeResult.statusTabel,
            };
          } catch (scrapeError) {
            console.error(`Scraping failed for ${tracking.tracking_code}:`, scrapeError);
          }
        } else {
            dhlInfo = {
                afleverMoment: tracking.aflever_moment ? new Date(tracking.aflever_moment).toLocaleString('nl-NL') : null,
                afgegevenMoment: tracking.afgegeven_moment ? new Date(tracking.afgegeven_moment).toLocaleString('nl-NL') : null,
                duration: tracking.duration || 'Onbekend',
                durationDays: tracking.duration_days,
                deliveryStatus: tracking.delivery_status || 'onbekend',
                statusTabel: [],
            }
        }
        
        return {
          id: tracking.id,
          rowNumber: startIndex + index + 1,
          trackingCode: tracking.tracking_code,
          customerName: tracking.customerName,
          email: tracking.email,
          orderId: tracking.order_id,
          dagenOnderweg: tracking.dagenOnderweg,
          tijdOnderweg,
          status: tracking.status,
          statusColor,
          lastAction: 'N/A', 
          verzendDatum: verzendMoment.toLocaleDateString('nl-NL'),
          verzendTime: verzendMoment.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
          isActive: tracking.is_active,
          deliveryStatus: dhlInfo?.deliveryStatus || tracking.delivery_status || 'onbekend',
          needsAction: tracking.needs_action,
          logs: [], // Logs worden niet meer per stuk opgehaald voor performance
          batchId: tracking.batch_id,
          matchedFrom: tracking.matched_from,
          lastStatusCheck: new Date(tracking.last_status_check).toLocaleString('nl-NL'),
          dhlInfo: dhlInfo,
        };
      })
    );
    
    // Voor accurate paginatie tellen we *alleen* de records die aan de DB-query voldoen.
    // De JS-filtering maakt dit onnauwkeurig, maar dat is een bewuste trade-off.
    // We gebruiken de lengte van de *gefilterde* array voor de UI.
    const totalFiltered = filteredTrackings.length;
    
    // Bereken statistieken op basis van de gefilterde data
    const activeCount = filteredTrackings.filter(t => t.is_active).length;
    const needsActionCount = filteredTrackings.filter(t => t.needs_action).length;

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
      trackings: finalTrackings,
      pagination: {
        page,
        limit,
        total: count || 0, // Totaal zonder JS filters
        pages: Math.ceil((count || 0) / limit), // Paginatie gebaseerd op totaal zonder JS filters
        showing: finalTrackings.length,
        filteredTotal: totalFiltered, // Totaal *met* JS filters
      },
      stats: {
        totalRecords: count || 0,
        // Stats worden nu complexer door de JS-filtering, voor nu laten we dit simpeler
        statusBreakdown: {}, 
        durationStats: {
          trackingsWithDuration: trackingsWithDuration.length,
          avgDuration: Number(avgDuration.toFixed(1)),
          avgDurationFormatted: avgDuration > 0 ? `${avgDuration.toFixed(1)} dagen` : 'Geen data',
          completedTrackings: completedTrackings.length,
          avgCompletedDuration: Number(avgCompletedDuration.toFixed(1)),
          avgCompletedDurationFormatted: avgCompletedDuration > 0 ? `${avgCompletedDuration.toFixed(1)} dagen` : 'Geen data'
        },
        needsAction: needsActionCount,
        timingSettings: timingSettings
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
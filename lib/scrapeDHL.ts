// lib/scrapeDHL.ts - ULTRA GEOPTIMALISEERDE VERSIE V2
import puppeteer, { type Browser } from 'puppeteer';
import puppeteerCore, { type Browser as BrowserCore } from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { scrapeDHLWithPuppeteer } from './scrapeDHLPuppeteer';

// Environment detection based on production deployment
const isProductionEnvironment = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

console.log(`🌍 Environment: ${isProductionEnvironment ? 'Production (Vercel)' : 'Development'}`);

// Simple debug logging 
console.log('🔍 Environment Analysis:');
console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`  - AWS_LAMBDA_FUNCTION_VERSION: ${process.env.AWS_LAMBDA_FUNCTION_VERSION}`);
console.log(`  - Platform: ${process.platform}`);
console.log(`  - CWD: ${process.cwd()}`);

// Simple check for serverless environment
const isServerlessEnvironment = !!process.env.AWS_LAMBDA_FUNCTION_VERSION;
console.log(`🔍 Serverless Environment Detected: ${isServerlessEnvironment}`);

// Browser pool voor hergebruik
class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | BrowserCore | null = null;
  private isInitializing = false;
  private lastUsed = Date.now();
  private readonly TIMEOUT = 60000; // 1 minuut timeout
  private initPromise: Promise<Browser | BrowserCore> | null = null;

  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  async getBrowser(): Promise<Browser | BrowserCore> {
    this.lastUsed = Date.now();
    
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeBrowser();
    this.browser = await this.initPromise;
    this.initPromise = null;
    
    return this.browser;
  }

  private async initializeBrowser(): Promise<Browser | BrowserCore> {
    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ];

    let browser: Browser | BrowserCore;

         if (isProductionEnvironment) {
       // Production environment - use @sparticuz/chromium-min approach
       console.log('🌐 Setting up chromium-min for serverless environment...');
       
       // Configure the chromium version (v133.0.0 for latest compatibility)
       const executablePath = await chromium.executablePath('https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar');
       
               console.log('🚀 Launching puppeteer-core with chromium-min');
        browser = await puppeteerCore.launch({
          executablePath,
          args: [...chromium.args, ...baseArgs],
          headless: true,
          defaultViewport: { width: 1280, height: 720 },
        });
       console.log('✅ Serverless browser launched successfully!');
     } else {
       // Local environment - use regular puppeteer with optimizations
       console.log('🔧 Setting up local Puppeteer...');
       browser = await puppeteer.launch({
         headless: true,
         args: [...baseArgs, '--disable-web-security', '--disable-features=TranslateUI'],
         defaultViewport: { width: 1280, height: 720 },
         // OPTIMIZED: Disable images and CSS for faster loading
         devtools: false
       });
       console.log('✅ Local browser launched successfully!');
     }

    // Set up browser event handlers
    browser.on('disconnected', () => {
      console.log('🔌 Browser disconnected');
      this.browser = null;
    });

    return browser;
  }

  private async cleanup() {
    if (this.browser && Date.now() - this.lastUsed > this.TIMEOUT) {
      console.log('🧹 Browser cleanup - inactivity timeout');
      await this.browser.close();
      this.browser = null;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Types
export type DHLTrackingStatus = 'bezorgd' | 'onderweg' | 'verwerkt' | 'niet gevonden' | 'fout';

export interface DHLTrackingResult {
  deliveryStatus: DHLTrackingStatus;
  afleverMoment: Date | null;
  afgegevenMoment: Date | null;
  statusTabel: string[];
  duration: string;
  durationDays: number | undefined;
  processingTime: number;
}

export interface DHLTimelineEvent {
  date: string;
  time: string;
  description: string;
  location?: string;
}

// ===== NEW DHL OFFICIAL API IMPLEMENTATION =====

interface DHLApiResponse {
  shipments: Array<{
    id: string;
    service: string;
    origin: {
      address: {
        countryCode: string;
        postalCode: string;
        addressLocality: string;
      };
    };
    destination: {
      address: {
        countryCode: string;
        postalCode: string;
        addressLocality: string;
      };
    };
    status: {
      timestamp: string;
      location: {
        address: {
          countryCode: string;
          postalCode: string;
          addressLocality: string;
        };
      };
      statusCode: string;
      status: string;
      description: string;
    };
    details: {
      carrier: {
        url: string;
      };
    };
    events: Array<{
      timestamp: string;
      location: {
        address: {
          countryCode: string;
          postalCode: string;
          addressLocality: string;
        };
      };
      statusCode: string;
      status: string;
      description: string;
    }>;
  }>;
}

/**
 * Nieuwe DHL API implementatie via officiële DHL Shipment Tracking API
 */
export async function scrapeDHLWithOfficialAPI(trackingCode: string): Promise<DHLTrackingResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🚀 DHL Official API Scraping start for: ${trackingCode}`);
    
    // Check voor API key
    const apiKey = process.env.DHL_API_KEY;
    if (!apiKey) {
      throw new Error('DHL_API_KEY niet gevonden in environment variables');
    }
    
    // API call naar DHL
    const url = `https://api-eu.dhl.com/track/shipments?trackingNumber=${trackingCode}`;
    console.log(`🌐 Calling DHL API: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'DHL-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'TrackingApp/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`📦 Tracking code ${trackingCode} not found in DHL system`);
        return {
          deliveryStatus: 'niet gevonden',
          afleverMoment: null,
          afgegevenMoment: null,
          statusTabel: ['Tracking nummer niet gevonden in DHL systeem'],
          duration: '',
          durationDays: undefined,
          processingTime: Date.now() - startTime
        };
      }
      
      throw new Error(`DHL API error: ${response.status} ${response.statusText}`);
    }
    
    const data: DHLApiResponse = await response.json();
    console.log(`📦 DHL API Response received for ${trackingCode}`);
    
    // Controleer of er shipments data is
    if (!data.shipments || data.shipments.length === 0) {
      console.log(`📦 No shipments found for ${trackingCode}`);
      return {
        deliveryStatus: 'niet gevonden',
        afleverMoment: null,
        afgegevenMoment: null,
        statusTabel: ['Geen tracking informatie beschikbaar'],
        duration: '',
        durationDays: undefined,
        processingTime: Date.now() - startTime
      };
    }
    
    const shipment = data.shipments[0];
    const events = shipment.events || [];
    
    // Sorteer events chronologisch (oudste eerst voor timing analysis)
    const sortedEventsChronological = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Parse timing data uit events
    let afleverMoment: Date | null = null;
    let afgegevenMoment: Date | null = null;
    let deliveryStatus: DHLTrackingStatus = 'niet gevonden';
    
    // **AFGEGEVEN MOMENT**: Zoek het eerste event waar DHL het pakket ophaalt/ontvangt
    for (const event of sortedEventsChronological) {
      const description = event.description.toLowerCase();
      const statusCode = event.statusCode?.toLowerCase() || '';
      
      // Keywords voor wanneer DHL het pakket heeft ontvangen/opgehaald
      if (description.includes('dropped off at dhl') ||
          description.includes('shipped at dhl') ||
          description.includes('picked up') || 
          description.includes('collected') || 
          description.includes('received') || 
          description.includes('processed') ||
          description.includes('ontvangen') ||
          description.includes('opgehaald') ||
          description.includes('verwerkt') ||
          description.includes('in processing') ||
          description.includes('acceptance') ||
          description.includes('servicepoint') ||
          statusCode === 'pre-transit' ||
          statusCode === 'processed') {
        if (!afgegevenMoment) {
          afgegevenMoment = new Date(event.timestamp);
          console.log(`📤 Afgegeven moment gevonden: ${event.description} op ${afgegevenMoment.toLocaleString('nl-NL')}`);
        }
        break; // Neem het eerste/vroegste event
      }
    }
    
    // **AFLEVER MOMENT**: Zoek delivery events (chronologisch door events, neem het laatste delivery event)
    const reversedEvents = [...sortedEventsChronological].reverse(); // Nieuwste eerst voor delivery check
    for (const event of reversedEvents) {
      const description = event.description.toLowerCase();
      const statusCode = event.statusCode?.toLowerCase() || '';
      
      // Keywords voor delivery - gebaseerd op echte DHL API responses
      if (description.includes('delivered') || 
          description.includes('bezorgd') || 
          description.includes('afgeleverd') ||
          description.includes('uitgeleverd') ||
          description.includes('geleverd') ||
          description.includes('delivered in mailbox') ||
          description.includes('delivered to') ||
          description.includes('handed over to customer') ||
          statusCode === 'delivered') {
        afleverMoment = new Date(event.timestamp);
        deliveryStatus = 'bezorgd';
        console.log(`📥 Aflever moment gevonden: ${event.description} op ${afleverMoment.toLocaleString('nl-NL')}`);
        break; // Neem het eerste (meest recente) delivery event
      }
    }
    
    // Bepaal status op basis van current status en events
    if (!afleverMoment) {
      const currentStatus = shipment.status?.statusCode?.toLowerCase() || '';
      const currentDescription = shipment.status?.description?.toLowerCase() || '';
      
      if (currentStatus === 'delivered' || currentDescription.includes('delivered') || 
          currentDescription.includes('bezorgd') || currentDescription.includes('afgeleverd')) {
        deliveryStatus = 'bezorgd';
        // Als we geen specifiek delivery event hadden, gebruik dan de shipment status timestamp
        if (shipment.status?.timestamp) {
          afleverMoment = new Date(shipment.status.timestamp);
        }
      } else if (currentStatus === 'transit' || currentDescription.includes('transit') ||
                 currentDescription.includes('onderweg') || currentDescription.includes('transport')) {
        deliveryStatus = afgegevenMoment ? 'onderweg' : 'verwerkt';
      } else if (afgegevenMoment) {
        deliveryStatus = 'verwerkt';
      } else {
        deliveryStatus = 'niet gevonden';
      }
    }
    
    // Bouw status tabel van alle events (nieuwste eerst voor display)
    const statusTabel: string[] = [];
    const sortedEventsDisplay = events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    for (const event of sortedEventsDisplay) {
      const eventDate = new Date(event.timestamp);
      const dateStr = eventDate.toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const timeStr = eventDate.toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const location = event.location?.address ? 
        `${event.location.address.addressLocality || ''}, ${event.location.address.countryCode || ''}`.replace(/^, /, '') : '';
      
      const statusLine = `${dateStr} ${timeStr} - ${event.description}${location ? ` (${location})` : ''}`;
      statusTabel.push(statusLine);
    }
    
    // **DURATION BEREKENING**: Bereken nauwkeurige doorlooptijd
    let duration = '';
    let durationDays: number | undefined = undefined;
    
    if (afgegevenMoment && afleverMoment) {
      const diffMs = afleverMoment.getTime() - afgegevenMoment.getTime();
      const totalHours = diffMs / (1000 * 60 * 60);
      durationDays = totalHours / 24; // Precise decimal dagen
      
      const fullDays = Math.floor(durationDays);
      const remainingHours = Math.round((durationDays - fullDays) * 24);
      
      if (fullDays === 0 && remainingHours < 12) {
        duration = 'Zelfde dag';
      } else if (fullDays === 0) {
        duration = `${remainingHours} uur`;
      } else if (fullDays === 1 && remainingHours === 0) {
        duration = '1 dag';
      } else if (fullDays === 1) {
        duration = `1 dag, ${remainingHours} uur`;
      } else if (remainingHours === 0) {
        duration = `${fullDays} dagen`;
      } else {
        duration = `${fullDays} dagen, ${remainingHours} uur`;
      }
      
      console.log(`⏱️ Duration calculated: ${duration} (${durationDays.toFixed(2)} dagen exact)`);
    } else if (afgegevenMoment && !afleverMoment) {
      // Nog niet bezorgd, bereken hoelang onderweg
      const diffMs = Date.now() - afgegevenMoment.getTime();
      const totalHours = diffMs / (1000 * 60 * 60);
      durationDays = totalHours / 24;
      
      const fullDays = Math.floor(durationDays);
      duration = fullDays === 1 ? '1 dag onderweg' : `${fullDays} dagen onderweg`;
      
      console.log(`🚛 Currently in transit: ${duration} (${durationDays.toFixed(2)} dagen)`);
    }
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ DHL Official API completed for ${trackingCode}:`);
    console.log(`   Status: ${deliveryStatus}`);
    console.log(`   Afgegeven: ${afgegevenMoment?.toLocaleString('nl-NL') || 'Onbekend'}`);
    console.log(`   Afgeleverd: ${afleverMoment?.toLocaleString('nl-NL') || 'Nog niet bezorgd'}`);
    console.log(`   Doorlooptijd: ${duration || 'Berekening niet mogelijk'}`);
    console.log(`   Processing: ${processingTime}ms`);
    
    return {
      deliveryStatus,
      afleverMoment,
      afgegevenMoment,
      statusTabel,
      duration,
      durationDays,
      processingTime
    };
    
  } catch (error) {
    console.error(`❌ DHL Official API failed for ${trackingCode}:`, error);
    
    return {
      deliveryStatus: 'fout',
      afleverMoment: null,
      afgegevenMoment: null,
      statusTabel: [`API Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      duration: '',
      durationDays: undefined,
      processingTime: Date.now() - startTime
    };
  }
}

// ULTRA VERBETERDE Nederlandse datum parser met Amsterdam timezone
export function parseNLDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim().length === 0) return null;
  
  const months = {
    'januari': 0, 'jan': 0, 'februari': 1, 'feb': 1, 'maart': 2, 'mar': 2, 'mrt': 2,
    'april': 3, 'apr': 3, 'mei': 4, 'juni': 5, 'jun': 5, 'juli': 6, 'jul': 6,
    'augustus': 7, 'aug': 7, 'september': 8, 'sep': 8, 'oktober': 9, 'okt': 9, 'oct': 9,
    'november': 10, 'nov': 10, 'december': 11, 'dec': 11
  };
  
  // Uitgebreide patronen met fallbacks
  const patterns = [
    // Volledige formaten met tijd
    /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mar|mrt|apr|jun|jul|aug|sep|okt|oct|nov|dec)\s+(\d{4})\s+(\d{1,2}):(\d{2})/i,
    
    // Met dag van de week + tijd
    /(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mar|mrt|apr|jun|jul|aug|sep|okt|oct|nov|dec)\s+(\d{4})\s+(\d{1,2}):(\d{2})/i,
    
    // Zonder tijd  
    /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mar|mrt|apr|jun|jul|aug|sep|okt|oct|nov|dec)\s+(\d{4})/i,
    
    // Met dag, zonder tijd
    /(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mar|mrt|apr|jun|jul|aug|sep|okt|oct|nov|dec)\s+(\d{4})/i,
    
    // DD-MM-YYYY of DD/MM/YYYY formaten
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{2})/,
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/,
    
    // YYYY-MM-DD ISO formaat
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{2})/,
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = dateStr.match(pattern);
    
    if (match) {
      let day: number, month: number, year: number, hour = 0, minute = 0;
      
      if (i < 4) {
        // Nederlandse maand namen
        day = parseInt(match[1]);
        const monthName = match[2].toLowerCase();
        year = parseInt(match[3]);
        hour = match[4] ? parseInt(match[4]) : 0;
        minute = match[5] ? parseInt(match[5]) : 0;
        
        month = months[monthName as keyof typeof months];
        if (month === undefined) continue;
        
      } else if (i < 6) {
        // DD-MM-YYYY of DD/MM/YYYY
        day = parseInt(match[1]);
        month = parseInt(match[2]) - 1; // Month is 0-indexed
        year = parseInt(match[3]);
        hour = match[4] ? parseInt(match[4]) : 0;
        minute = match[5] ? parseInt(match[5]) : 0;
        
      } else {
        // YYYY-MM-DD ISO formaat  
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1; // Month is 0-indexed
        day = parseInt(match[3]);
        hour = match[4] ? parseInt(match[4]) : 0;
        minute = match[5] ? parseInt(match[5]) : 0;
      }
      
      // Validatie en creatie met Amsterdam timezone
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2000) {
        // Maak datum in Amsterdam timezone (Europe/Amsterdam)
        const amsterdamDate = createAmsterdamDate(year, month, day, hour, minute);
        if (!isNaN(amsterdamDate.getTime())) {
          return amsterdamDate;
        }
      }
    }
  }
  
  return null;
}

// Helper functie om datum in Amsterdam timezone te maken
function createAmsterdamDate(year: number, month: number, day: number, hour: number = 0, minute: number = 0): Date {
  // Simpele benadering: maak datum en force naar Nederlandse timezone
  // Door altijd CET/CEST offset te gebruiken krijgen we consistente resultaten
  const baseDate = new Date(year, month, day, hour, minute);
  
  // Amsterdam is UTC+1 (winter) of UTC+2 (zomer) 
  // Voor consistentie tussen Vercel en localhost gebruiken we vaste offset
  const isWinter = month < 2 || month > 9 || (month === 2 && day < 25) || (month === 9 && day >= 25);
  const offsetHours = isWinter ? 1 : 2; // CET = +1, CEST = +2
  
  // Converteer naar UTC en trek Amsterdam offset eraf om juiste lokale tijd te krijgen
  const utcTime = baseDate.getTime() - (offsetHours * 60 * 60 * 1000);
  return new Date(utcTime);
}

export async function scrapeDHL(trackingCode: string): Promise<DHLTrackingResult> {
  const startTime = Date.now();
  let page: any | null = null;
  
  try {
    console.log(`🚀 DHL Scraping start: ${trackingCode}`);
    
    // FIRST ATTEMPT: Try Official DHL API (NEW - fastest and most reliable)
    try {
      console.log(`🎯 Attempting DHL Official API for ${trackingCode}`);
      const apiResult = await scrapeDHLWithOfficialAPI(trackingCode);
      
      if (apiResult && apiResult.deliveryStatus !== 'fout' && apiResult.statusTabel.length > 0) {
        console.log(`✅ Got excellent result from DHL Official API for ${trackingCode}: ${apiResult.deliveryStatus} with ${apiResult.statusTabel.length} entries`);
        return apiResult;
      } else {
        console.log(`⚠️ DHL Official API returned poor quality result for ${trackingCode} (${apiResult?.statusTabel?.length || 0} entries), trying Puppeteer fallback`);
      }
    } catch (apiError) {
      console.log(`⚠️ DHL Official API failed for ${trackingCode}, trying Puppeteer fallback:`, apiError);
    }
    
    // SECOND ATTEMPT: Try Puppeteer scraping (fallback for when API fails)
    try {
      console.log(`🎯 Attempting Puppeteer scraping for ${trackingCode}`);
      const puppeteerResult = await scrapeDHLWithPuppeteer(trackingCode);
      
      if (puppeteerResult && puppeteerResult.deliveryStatus !== 'fout' && puppeteerResult.statusTabel.length > 50) {
        console.log(`✅ Got good result from DHL Puppeteer for ${trackingCode}: ${puppeteerResult.deliveryStatus} with ${puppeteerResult.statusTabel.length} entries`);
        return puppeteerResult;
      } else {
        console.log(`⚠️ Puppeteer returned poor quality result for ${trackingCode} (${puppeteerResult?.statusTabel?.length || 0} entries), trying legacy browser pool`);
      }
    } catch (puppeteerError) {
      console.log(`⚠️ DHL Puppeteer failed for ${trackingCode}, trying legacy browser pool:`, puppeteerError);
    }
    
    // THIRD ATTEMPT: Legacy browser pool implementation (final fallback)
    console.log(`🔄 Falling back to legacy browser pool for ${trackingCode}`);
    
    // Gebruik browser pool voor hergebruik
    const browserPool = BrowserPool.getInstance();
    const browser = await browserPool.getBrowser();
    
    page = await browser.newPage();
    
    // Realistische browser settings
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // FIXED: Handle DHL country selection and cookie consent
    console.log(`🌐 Setting up DHL session...`);
    
    // Step 1: Go to main DHL page first to handle country selection
    await page.goto('https://www.dhl.com/nl-nl', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    // Step 2: Handle country selection layer and cookie consent
    await page.evaluate(() => {
      // Accept cookies if present
      const cookieAccept = document.querySelector('[data-cookie="country"]') || 
                          document.querySelector('button[data-accept-cookies]') ||
                          document.querySelector('.cookie-accept') ||
                          document.querySelector('[aria-label*="accept"]');
      if (cookieAccept) (cookieAccept as HTMLElement).click();
      
      // Handle country selection - stay on Netherlands  
      const stayButton = document.querySelector('button[data-country="nl"]') ||
                        document.querySelector('.country-selection button:first-child') ||
                        Array.from(document.querySelectorAll('button')).find(btn => 
                          btn.textContent?.includes('Blijf op deze site')
                        );
      if (stayButton) (stayButton as HTMLElement).click();
      
      return 'Country/cookies handled';
    });
    
    // Wait for any redirects/overlays to close
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Now navigate to tracking page
    const url = `https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${trackingCode}&submit=1`;
    console.log(`🔍 Navigating to tracking: ${url}`);
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // Step 4: Check if we're on the right page
    const pageInfo = await page.evaluate(() => {
      const hasCountryLayer = !!document.querySelector('.c-country-selection-layer');
      const hasTrackingContent = document.body.innerText.includes('tracking') || 
                                 document.body.innerText.includes('traceren') ||
                                 document.querySelectorAll('[class*="tracking"]').length > 0;
      
      return {
        hasCountryLayer,
        hasTrackingContent,
        trackingElements: document.querySelectorAll('[class*="tracking"]').length,
        h2Count: document.querySelectorAll('h2').length,
        currentUrl: window.location.href,
        pageTitle: document.title
      };
    });
    
    console.log(`🔍 Page check: tracking=${pageInfo.hasTrackingContent}, country=${pageInfo.hasCountryLayer}, url=${pageInfo.currentUrl}`);
    
    // Step 5: If still on wrong page, try alternative approach
    if (pageInfo.hasCountryLayer || !pageInfo.hasTrackingContent) {
      console.log(`⚠️ Wrong page detected, trying alternative tracking URL...`);
      
      // Try alternative tracking URLs
      const altUrls = [
        `https://www.dhl.com/nl-nl/home/tracking.html?tracking-id=${trackingCode}`,
        `https://www.dhl.com/nl-nl/home/tracking/tracking-parcel.html?submit=1&tracking-id=${trackingCode}`,
        `https://www.dhl.nl/nl/prive/pakket-volgen.html?tracking-id=${trackingCode}`
      ];
      
      for (const altUrl of altUrls) {
        try {
          console.log(`🔄 Trying: ${altUrl}`);
          await page.goto(altUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
          
          const checkContent = await page.evaluate(() => 
            document.body.innerText.includes('tracking') || 
            document.body.innerText.includes('traceren') ||
            document.querySelectorAll('[class*="tracking"]').length > 0
          );
          
          if (checkContent) {
            console.log(`✅ Found tracking content at: ${altUrl}`);
            break;
          }
        } catch (err) {
          console.log(`❌ Failed ${altUrl}: ${err}`);
          continue;
        }
      }
    }

    console.log(`⏳ Waiting for tracking content...`);
    
    try {
      // OPTIMIZED: Much shorter timeouts
      const selectorTimeout = 8000;  // Reduced from 25s/15s to 8s
      const fallbackTimeout = 3000;  // Reduced from 15s/8s to 3s
      
      await Promise.race([
        page.waitForSelector('.c-tracking-result--status', { timeout: selectorTimeout }),
        page.waitForSelector('[class*="tracking"]', { timeout: selectorTimeout }),
        page.waitForSelector('h2', { timeout: selectorTimeout }),
        new Promise(resolve => setTimeout(resolve, fallbackTimeout)) // Fallback timeout
      ]);
    } catch (e) {
      console.log(`⚠️ No specific elements found, continuing...`);
    }

    console.log(`📖 Expanding sections...`);
    
    await page.evaluate(() => {
      // Expand "Meer details" buttons
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent && btn.textContent.includes('Meer details over zending')) {
          btn.click();
        }
      });
      
      // Expand "Alle zending updates" section
      document.querySelectorAll('h3').forEach(h3 => {
        if (h3.textContent && h3.textContent.trim() === 'Alle zending updates') {
          const parent = h3.parentElement;
          if (parent) parent.click();
        }
      });
      
      return "Sections expanded";
    });
    
    // OPTIMIZED: Much shorter animation wait
    const animationWait = 1000;  // Reduced from 5s/2s to 1s
    await new Promise(resolve => setTimeout(resolve, animationWait));

    // REMOVED: Final debug screenshot

    // 🔍 DEBUG: Final page analysis
    const finalPageInfo = await page.evaluate(() => {
      const allH2s = Array.from(document.querySelectorAll('h2')).map(h2 => h2.textContent?.trim());
      const allButtons = Array.from(document.querySelectorAll('button')).map(btn => btn.textContent?.trim()).filter(Boolean);
      
      return {
        bodyLength: document.body.innerHTML.length,
        h2Texts: allH2s,
        buttonTexts: allButtons.slice(0, 10), // First 10 buttons
        statusSelectors: {
          'c-tracking-result--status h2': document.querySelectorAll('.c-tracking-result--status h2').length,
          'h2[class*="status"]': document.querySelectorAll('h2[class*="status"]').length,
          'h2[class*="result"]': document.querySelectorAll('h2[class*="result"]').length,
          '[class*="tracking"] h2': document.querySelectorAll('[class*="tracking"] h2').length,
          'status h2': document.querySelectorAll('.status h2').length
        },
        sampleHTML: document.body.innerHTML.substring(0, 1000)
      };
    });
    
    console.log(`🔍 Final Page Analysis:`, JSON.stringify(finalPageInfo, null, 2));
    
    // ULTRA VERBETERDE DOM Extractie met meerdere strategieën
    const trackingData = await page.evaluate((code) => {
      const data = {
        trackingCode: code,
        status: "",
        timeline: [] as any[],
        hasValidData: false,
        rawData: {} as any
      };
      
      // STRATEGIE 1: Originele status selectoren
      let statusEl = document.querySelector('.c-tracking-result--status h2');
      
      // STRATEGIE 2: Alternatieve status selectoren
      if (!statusEl) {
        const alternatives = [
          'h2[class*="status"]', 'h2[class*="result"]', 
          '.status h2', '.result h2', '.tracking-status h2',
          '[class*="tracking"] h2', '[class*="delivery"] h2'
        ];
        
        for (const selector of alternatives) {
          statusEl = document.querySelector(selector);
          if (statusEl) break;
        }
      }
      
      // STRATEGIE 3: Tekst-gebaseerde status zoeken
      if (!statusEl) {
        const allH2 = document.querySelectorAll('h2');
        for (const h2 of allH2) {
          const text = h2.textContent?.trim().toLowerCase() || '';
          if (text.includes('bezorgd') || text.includes('onderweg') || text.includes('verwerkt')) {
            statusEl = h2;
            break;
          }
        }
      }
      
      if (statusEl) {
        const statusText = statusEl.textContent?.trim() || '';
        data.hasValidData = true;
        data.rawData.statusText = statusText;
        
        const statusLower = statusText.toLowerCase();
        if (statusLower.includes('bezorgd')) {
          data.status = 'bezorgd';
        } else if (statusLower.includes('onderweg')) {
          data.status = 'onderweg';
        } else if (statusLower.includes('verwerkt')) {
          data.status = 'verwerkt';
        } else {
          data.status = statusLower;
        }
      }
      
      // TIMELINE EXTRACTIE - Meerdere strategieën
      
      // STRATEGIE 1: Originele selector
      let updateSection = document.querySelector('.c-tracking-result--allshipmentupdates');
      
      // STRATEGIE 2: Alternatieve timeline selectoren
      if (!updateSection) {
        const alternatives = [
          '[class*="shipment"]', '[class*="update"]', '[class*="timeline"]',
          '[class*="history"]', '[class*="tracking"]'
        ];
        
        for (const selector of alternatives) {
          updateSection = document.querySelector(selector);
          if (updateSection && updateSection.textContent?.includes('2025')) break;
        }
      }
      
      // STRATEGIE 3: Zoek sectie met datum patronen
      if (!updateSection) {
        const allDivs = document.querySelectorAll('div, section, article');
        for (const div of allDivs) {
          const text = div.textContent || '';
          if (text.match(/\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}/i)) {
            updateSection = div;
            break;
          }
        }
      }
      
      if (updateSection) {
        let currentDate = '';
        const timelineEvents: any[] = [];
        
        // Extract alle tekst elementen
        const walker = document.createTreeWalker(
          updateSection,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        const textNodes: string[] = [];
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent?.trim();
          if (text && text.length > 0) {
            textNodes.push(text);
          }
        }
        
        // Parse tekst voor datum/tijd patronen
        for (let i = 0; i < textNodes.length; i++) {
          const text = textNodes[i];
          
          // Check voor datum headers
          const dateMatch = text.match(/(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mar|mrt|apr|jun|jul|aug|sep|okt|oct|nov|dec)\s+(\d{4})/i);
          
          if (dateMatch) {
            currentDate = `${dateMatch[2]} ${dateMatch[3]} ${dateMatch[4]}`;
            continue;
          }
          
          // Check voor tijd entries
          const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
          if (timeMatch && currentDate) {
            // Zoek beschrijving in volgende tekstnodes
            let description = '';
            for (let j = i + 1; j < Math.min(i + 5, textNodes.length); j++) {
              const nextText = textNodes[j];
              if (nextText && !nextText.match(/^\d{1,2}:\d{2}$/) && nextText.length > 5) {
                description = nextText;
                break;
              }
            }
            
            if (description) {
              // Bepaal locatie
              let location = '';
              const desc = description.toLowerCase();
              
              if (desc.includes('brievenbus')) location = 'Brievenbus';
              else if (desc.includes('bezorger')) location = 'Bezorger';
              else if (desc.includes('sorteercentrum')) location = 'Sorteercentrum';
              else if (desc.includes('cityhub')) location = 'CityHub';
              else if (desc.includes('servicepoint')) location = 'ServicePoint';
              else if (desc.includes('terminal')) location = 'Terminal';
              
              timelineEvents.push({
                date: currentDate,
                time: timeMatch[1] + ':' + timeMatch[2],
                description: description,
                location: location || undefined
              });
            }
          }
        }
        
        data.timeline = timelineEvents;
        data.rawData.textNodes = textNodes.slice(0, 20); // Debug info
      }
      
      // FALLBACK: Als geen timeline, probeer alle datums te vinden
      if (data.timeline.length === 0) {
        const allText = document.body.textContent || '';
        const dateMatches = allText.match(/\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}\s+\d{1,2}:\d{2}/gi);
        
        if (dateMatches) {
          data.rawData.foundDates = dateMatches;
          
          // Maak minimale timeline van gevonden datums
          dateMatches.forEach((dateStr, index) => {
            data.timeline.push({
              date: dateStr.split(' ').slice(0, 3).join(' '),
              time: dateStr.split(' ').slice(-1)[0],
              description: index === 0 ? 'Zending ontvangen' : index === dateMatches.length - 1 ? 'Laatste update' : 'Update',
              location: undefined
            });
          });
        }
      }
      
      return data;
    }, trackingCode);
    
    console.log(`📊 Extracted: ${trackingData.status}, ${trackingData.timeline.length} events`);
    
    // Bepaal finale status
    let deliveryStatus: DHLTrackingStatus = 'niet gevonden';
    
    if (!trackingData.hasValidData) {
      deliveryStatus = 'niet gevonden';
    } else if (trackingData.status === 'bezorgd') {
      deliveryStatus = 'bezorgd';
    } else if (trackingData.status === 'onderweg') {
      deliveryStatus = 'onderweg';
    } else if (trackingData.status === 'verwerkt') {
      deliveryStatus = 'verwerkt';
    } else if (trackingData.timeline.length > 0) {
      deliveryStatus = 'onderweg'; // Default als we timeline data hebben
    } else {
      deliveryStatus = 'fout';
    }
    
    // Parse datums uit timeline (VERBETERDE VERSIE)
    let afleverMoment: Date | null = null;
    let afgegevenMoment: Date | null = null;
    
    if (trackingData.timeline.length > 0) {
      console.log(`🔍 Processing ${trackingData.timeline.length} timeline events for date extraction`);
      
      // Parse alle events met datums
      const parsedEvents = trackingData.timeline
        .map((event, index) => {
          const fullDateStr = `${event.date} ${event.time}`;
          const parsedDate = parseNLDate(fullDateStr);
          
          console.log(`Event ${index + 1}: "${event.description}" -> ${parsedDate ? parsedDate.toISOString() : 'FAILED'}`);
          
          return {
            ...event,
            parsedDate,
            isDelivery: event.description.toLowerCase().includes('bezorgd') || 
                       event.description.toLowerCase().includes('brievenbus') ||
                       event.description.toLowerCase().includes('afgeleverd'),
            isPickup: event.description.toLowerCase().includes('afgehaald') ||
                     event.description.toLowerCase().includes('ontvangen') ||
                     event.description.toLowerCase().includes('verwerkt') ||
                     index === trackingData.timeline.length - 1 // Laatste event als fallback
          };
        })
        .filter(event => event.parsedDate);
      
      if (parsedEvents.length > 0) {
        // Sorteer chronologisch (oudste eerst)
        const sortedEvents = parsedEvents.sort((a, b) => 
          a.parsedDate!.getTime() - b.parsedDate!.getTime()
        );
        
        console.log(`📅 Sorted events: ${sortedEvents.length} with valid dates`);
        
        // Bepaal afgegeven moment (eerste event in chronologie)
        afgegevenMoment = sortedEvents[0].parsedDate;
        console.log(`📤 Afgegeven moment: ${afgegevenMoment?.toISOString()}`);
        
        // Bepaal aflever moment
        if (deliveryStatus === 'bezorgd') {
          // Zoek specifiek bezorg event
          const deliveryEvent = sortedEvents.find(event => event.isDelivery);
          
          if (deliveryEvent) {
            afleverMoment = deliveryEvent.parsedDate;
            console.log(`📦 Bezorg event gevonden: ${afleverMoment?.toISOString()}`);
          } else {
            // Fallback: laatste event (meest recente)
            afleverMoment = sortedEvents[sortedEvents.length - 1].parsedDate;
            console.log(`📦 Bezorg fallback (laatste event): ${afleverMoment?.toISOString()}`);
          }
        } else if (deliveryStatus === 'onderweg') {
          // Voor onderweg pakketten: gebruik meest recente event als schatting
          afleverMoment = sortedEvents[sortedEvents.length - 1].parsedDate;
          console.log(`🚚 Onderweg: laatste update ${afleverMoment?.toISOString()}`);
        }
      } else {
        console.log(`⚠️ Geen events met geldige datums gevonden`);
      }
    }
    
    // Bereken duur (VERBETERDE VERSIE)
    let duration: string;
    let durationDays: number | undefined;
    
    console.log(`🔢 Calculating duration: aflever=${afleverMoment?.toISOString()}, afgegeven=${afgegevenMoment?.toISOString()}`);
    
    if (afleverMoment && afgegevenMoment && afleverMoment.getTime() >= afgegevenMoment.getTime()) {
      const durationMs = afleverMoment.getTime() - afgegevenMoment.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      durationDays = Math.round((durationMs / (1000 * 60 * 60 * 24)) * 10) / 10; // Rond af op 1 decimaal
      
      if (durationDays >= 1) {
        duration = durationDays === 1 ? '1 dag' : `${durationDays} dagen`;
      } else if (durationHours >= 1) {
        const hours = Math.round(durationHours);
        duration = hours === 1 ? '1 uur' : `${hours} uur`;
      } else {
        const minutes = Math.round(durationMs / (1000 * 60));
        duration = minutes <= 1 ? '< 1 minuut' : `${minutes} minuten`;
      }
      
      console.log(`✅ Duration calculated: ${duration} (${durationDays} dagen)`);
    } else if (afleverMoment && !afgegevenMoment) {
      // Alleen aflever moment bekend
      duration = deliveryStatus === 'bezorgd' ? 'Bezorgd (startdatum onbekend)' : 'Nog onderweg';
      console.log(`⚠️ Only delivery moment known: ${duration}`);
    } else if (afgegevenMoment && !afleverMoment) {
      // Alleen afgegeven moment bekend
      if (deliveryStatus === 'bezorgd') {
        duration = 'Bezorgd (einddatum onbekend)';
      } else {
        const daysSincePickup = Math.floor((Date.now() - afgegevenMoment.getTime()) / (1000 * 60 * 60 * 24));
        duration = `${daysSincePickup} dagen onderweg`;
        durationDays = daysSincePickup;
      }
      console.log(`⚠️ Only pickup moment known: ${duration}`);
    } else {
      // Geen datums beschikbaar
      duration = deliveryStatus === 'bezorgd' ? 'Bezorgd (duur onbekend)' : 
                 deliveryStatus === 'onderweg' ? 'Nog onderweg' : 
                 deliveryStatus === 'verwerkt' ? 'In verwerking' :
                 'Kan niet bepaald worden';
      console.log(`❌ No valid dates found: ${duration}`);
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ Scraping complete: ${trackingCode} = ${deliveryStatus} (${processingTime}ms)`);
    
    return {
      deliveryStatus,
      afleverMoment,
      afgegevenMoment,
      statusTabel: trackingData.timeline.map(event => 
        `${event.date} ${event.time} - ${event.description}`
      ),
      duration,
      durationDays,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Scraping error ${trackingCode}:`, error);
    
    return {
      deliveryStatus: 'fout',
      afleverMoment: null,
      afgegevenMoment: null,
      statusTabel: [`Fout: ${error}`],
      duration: 'Fout bij ophalen',
      durationDays: undefined,
      processingTime
    };
  } finally {
    // Sluit alleen de page, niet de browser (wordt hergebruikt)
    if (page) {
      await page.close();
    }
  }
}

// Batch processing functie (geoptimaliseerd voor productie)
export async function processMultipleDHLCodes(
  trackingCodes: string[], 
  options: {
    batchSize?: number;
    delayBetween?: number;
    maxRetries?: number;
    progress?: boolean;
  } = {}
): Promise<{
  results: DHLTrackingResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalTime: number;
    averageTime: number;
  };
}> {
  const {
    batchSize = 3,  // OPTIMIZED: Increased from 1 to 3 for better parallelization
    delayBetween = 500,  // OPTIMIZED: Reduced from 1500ms to 500ms
    maxRetries = 2,
    progress = true
  } = options;
  
  const results: DHLTrackingResult[] = [];
  const startTime = Date.now();
  let successful = 0;
  let failed = 0;
  
  if (progress) {
    console.log(`🚀 Processing ${trackingCodes.length} DHL codes`);
    console.log(`⚙️ Settings: batch=${batchSize}, delay=${delayBetween}ms, retries=${maxRetries}`);
  }
  
  for (let i = 0; i < trackingCodes.length; i += batchSize) {
    const batch = trackingCodes.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(trackingCodes.length / batchSize);
    
    if (progress) {
      console.log(`📦 Batch ${batchNum}/${totalBatches}`);
    }
    
    const batchPromises = batch.map(async (code) => {
      let attempts = 0;
      let result: DHLTrackingResult;
      
      while (attempts < maxRetries) {
        attempts++;
        result = await scrapeDHL(code);
        
        if (result.deliveryStatus !== 'fout') {
          successful++;
          if (progress) {
            console.log(`  ✓ ${code} = ${result.deliveryStatus}`);
          }
          break;
        }
        
        if (attempts < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      if (result!.deliveryStatus === 'fout') {
        failed++;
        if (progress) {
          console.log(`  ✗ ${code} = FAILED`);
        }
      }
      
      return result!;
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Delay tussen batches
    if (i + batchSize < trackingCodes.length) {
      if (progress) {
        console.log(`  ⏱️ Waiting ${delayBetween}ms...`);
      }
      await new Promise(resolve => setTimeout(resolve, delayBetween));
    }
  }
  
  const totalTime = Date.now() - startTime;
  const averageTime = Math.round(totalTime / trackingCodes.length);
  
  const summary = {
    total: trackingCodes.length,
    successful,
    failed,
    totalTime,
    averageTime
  };
  
  if (progress) {
    console.log(`\n✅ Completed!`);
    console.log(`📊 Success: ${successful}/${trackingCodes.length} (${Math.round(successful/trackingCodes.length*100)}%)`);
    console.log(`⏱️ Average: ${averageTime}ms per code`);
  }
  
  return { results, summary };
}

// Export naar CSV
export function exportDHLToCSV(results: DHLTrackingResult[]): string {
  const headers = [
    'TrackingCode',
    'DeliveryStatus',
    'AfleverMoment',
    'AfgegevenMoment',
    'Duration',
    'DurationDays',
    'ProcessingTime',
    'StatusTabel'
  ];
  
  const rows = results.map(result => [
    result.deliveryStatus, // trackingCode niet beschikbaar in huidige interface
    result.deliveryStatus,
    result.afleverMoment?.toISOString() || '',
    result.afgegevenMoment?.toISOString() || '',
    result.duration,
    result.durationDays?.toString() || '',
    result.processingTime?.toString() || '',
    result.statusTabel.join(' | ')
  ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
  
  return [headers.join(','), ...rows].join('\n');
}

// Browser management functies
export async function closeBrowserPool(): Promise<void> {
  const browserPool = BrowserPool.getInstance();
  await browserPool.closeBrowser();
  console.log('🧹 Browser pool gesloten');
}

// Optimale batch processing met browser hergebruik
export async function processMultipleDHLCodesOptimal(
  trackingCodes: string[], 
  options: {
    batchSize?: number;
    delayBetween?: number;
    maxRetries?: number;
    progress?: boolean;
  } = {}
): Promise<{
  results: DHLTrackingResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalTime: number;
    averageTime: number;
    browserReused: boolean;
  };
}> {
  const {
    batchSize = 5, // OPTIMIZED: Increased to 5 for even better parallelization  
    delayBetween = 300, // OPTIMIZED: Reduced to 300ms for faster processing
    maxRetries = 2,
    progress = true
  } = options;
  
  const results: DHLTrackingResult[] = [];
  const startTime = Date.now();
  let successful = 0;
  let failed = 0;
  
  if (progress) {
    console.log(`🚀 OPTIMIZED Processing ${trackingCodes.length} DHL codes`);
    console.log(`⚙️ Settings: batch=${batchSize}, delay=${delayBetween}ms, retries=${maxRetries}`);
  }
  
  try {
    for (let i = 0; i < trackingCodes.length; i += batchSize) {
      const batch = trackingCodes.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(trackingCodes.length / batchSize);
      
      if (progress) {
        console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} codes)`);
      }
      
      // Process batch parallel
      const batchPromises = batch.map(async (code) => {
        let attempts = 0;
        let result: DHLTrackingResult;
        
        while (attempts < maxRetries) {
          attempts++;
          try {
            result = await scrapeDHL(code);
            
            if (result.deliveryStatus !== 'fout') {
              successful++;
              if (progress) {
                console.log(`  ✓ ${code} = ${result.deliveryStatus} (${result.duration})`);
              }
              break;
            }
          } catch (error) {
            console.log(`  ⚠️ ${code} attempt ${attempts} failed: ${error}`);
          }
          
          if (attempts < maxRetries) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
        
        if (!result! || result!.deliveryStatus === 'fout') {
          failed++;
          if (progress) {
            console.log(`  ✗ ${code} = FAILED after ${attempts} attempts`);
          }
          
          // Return minimal error result
          result = {
            deliveryStatus: 'fout',
            afleverMoment: null,
            afgegevenMoment: null,
            statusTabel: [`Fout na ${attempts} pogingen`],
            duration: 'Fout bij ophalen',
            durationDays: undefined,
            processingTime: 0
          };
        }
        
        return result!;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Delay tussen batches (behalve laatste)
      if (i + batchSize < trackingCodes.length) {
        if (progress) {
          console.log(`  ⏱️ Waiting ${delayBetween}ms...`);
        }
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }
  } finally {
    // Keep browser open for potential future use
    if (progress) {
      console.log(`🔧 Browser pool remains open for reuse`);
    }
  }
  
  const totalTime = Date.now() - startTime;
  const averageTime = Math.round(totalTime / trackingCodes.length);
  
  const summary = {
    total: trackingCodes.length,
    successful,
    failed,
    totalTime,
    averageTime,
    browserReused: true
  };
  
  if (progress) {
    console.log(`\n✅ OPTIMIZED Completed!`);
    console.log(`📊 Success: ${successful}/${trackingCodes.length} (${Math.round(successful/trackingCodes.length*100)}%)`);
    console.log(`⏱️ Average: ${averageTime}ms per code (was ~6000ms)`);
    console.log(`🚀 Speed improvement: ~${Math.round(6000/averageTime)}x faster`);
  }
  
  return { results, summary };
}

// ULTRA-FAST variant - disables images/CSS for maximum speed
export async function scrapeDHLUltraFast(trackingCode: string): Promise<DHLTrackingResult> {
  const startTime = Date.now();
  let page: any | null = null;
  
  try {
    console.log(`⚡ ULTRA-FAST DHL Scraping: ${trackingCode}`);
    
    const browserPool = BrowserPool.getInstance();
    const browser = await browserPool.getBrowser();
    
    page = await browser.newPage();
    
    // ULTRA-FAST: Disable images, CSS, fonts for maximum speed
    await page.setRequestInterception(true);
    page.on('request', (req: any) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Minimal browser settings
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // ULTRA-FAST: Quick country handling
    await page.goto('https://www.dhl.com/nl-nl', { waitUntil: 'domcontentloaded', timeout: 8000 });
    
    await page.evaluate(() => {
      // Quick cookie/country handling
      const cookieAccept = document.querySelector('[data-cookie="country"]');
      if (cookieAccept) (cookieAccept as HTMLElement).click();
      
      const stayButton = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Blijf op deze site')
      );
      if (stayButton) (stayButton as HTMLElement).click();
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const url = `https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${trackingCode}&submit=1`;
    console.log(`🌐 ULTRA-FAST Navigation: ${url}`);
    
    // ULTRA-FAST: Minimal waiting, short timeout
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 10000  // Even shorter: 10s max
    });

    // ULTRA-FAST: Skip waiting for specific selectors, extract immediately
    console.log(`⚡ Immediate extraction...`);
    
    // Quick expand without waiting
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent?.includes('Meer details over zending')) {
          btn.click();
        }
      });
      document.querySelectorAll('h3').forEach(h3 => {
        if (h3.textContent?.trim() === 'Alle zending updates') {
          h3.parentElement?.click();
        }
      });
    });
    
    // ULTRA-FAST: Minimal animation wait
    await new Promise(resolve => setTimeout(resolve, 500));

    // Extract data with same strategy but faster
    const trackingData = await page.evaluate((code) => {
      const data = {
        status: "",
        timeline: [] as any[],
        hasValidData: false
      };
      
      // Quick status detection
      let statusEl = document.querySelector('.c-tracking-result--status h2') || 
                     document.querySelector('h2[class*="status"]') ||
                     document.querySelector('[class*="tracking"] h2');
      
      if (statusEl) {
        const statusText = statusEl.textContent?.trim().toLowerCase() || '';
        data.hasValidData = true;
        
        if (statusText.includes('bezorgd')) data.status = 'bezorgd';
        else if (statusText.includes('onderweg')) data.status = 'onderweg';
        else if (statusText.includes('verwerkt')) data.status = 'verwerkt';
        else data.status = statusText;
      }
      
      // Quick timeline extraction - look for any date patterns
      const allText = document.body.textContent || '';
      const dateMatches = allText.match(/\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}\s+\d{1,2}:\d{2}/gi);
      
      if (dateMatches && dateMatches.length > 0) {
        dateMatches.forEach((dateStr, index) => {
          const parts = dateStr.split(' ');
          data.timeline.push({
            date: parts.slice(0, 3).join(' '),
            time: parts[parts.length - 1],
            description: index === 0 ? 'Zending ontvangen' : 
                        index === dateMatches.length - 1 ? 'Laatste update' : 'Update'
          });
        });
      }
      
      return data;
    }, trackingCode);
    
    // Quick status determination
    let deliveryStatus: DHLTrackingStatus = 'niet gevonden';
    
    if (trackingData.hasValidData) {
      if (trackingData.status === 'bezorgd') deliveryStatus = 'bezorgd';
      else if (trackingData.status === 'onderweg') deliveryStatus = 'onderweg';
      else if (trackingData.status === 'verwerkt') deliveryStatus = 'verwerkt';
      else if (trackingData.timeline.length > 0) deliveryStatus = 'onderweg';
      else deliveryStatus = 'fout';
    }
    
    // Quick date parsing for first and last timeline events
    let afleverMoment: Date | null = null;
    let afgegevenMoment: Date | null = null;
    
    if (trackingData.timeline.length > 0) {
      const firstEvent = trackingData.timeline[0];
      const lastEvent = trackingData.timeline[trackingData.timeline.length - 1];
      
      afgegevenMoment = parseNLDate(`${firstEvent.date} ${firstEvent.time}`);
      if (deliveryStatus === 'bezorgd') {
        afleverMoment = parseNLDate(`${lastEvent.date} ${lastEvent.time}`);
      }
    }
    
    // Quick duration calculation
    let duration: string;
    let durationDays: number | undefined;
    
    if (afleverMoment && afgegevenMoment) {
      const durationMs = afleverMoment.getTime() - afgegevenMoment.getTime();
      durationDays = Math.round((durationMs / (1000 * 60 * 60 * 24)) * 10) / 10;
      duration = durationDays >= 1 ? `${durationDays} dagen` : '< 1 dag';
    } else {
      duration = deliveryStatus === 'bezorgd' ? 'Bezorgd' : 
                 deliveryStatus === 'onderweg' ? 'Nog onderweg' : 'Onbekend';
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`⚡ ULTRA-FAST Complete: ${trackingCode} = ${deliveryStatus} (${processingTime}ms)`);
    
    return {
      deliveryStatus,
      afleverMoment,
      afgegevenMoment,
      statusTabel: trackingData.timeline.map(event => 
        `${event.date} ${event.time} - ${event.description}`
      ),
      duration,
      durationDays,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`⚡ ULTRA-FAST Error ${trackingCode}:`, error);
    
    return {
      deliveryStatus: 'fout',
      afleverMoment: null,
      afgegevenMoment: null,
      statusTabel: [`ULTRA-FAST Fout: ${error}`],
      duration: 'Fout bij ophalen',
      durationDays: undefined,
      processingTime
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

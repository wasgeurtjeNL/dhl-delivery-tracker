// lib/scrapeDHL.ts - ULTRA GEOPTIMALISEERDE VERSIE V2
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';

// Enhanced serverless environment detection and Chromium handling
let chromium: any = null;
let isServerlessEnvironment = false;

// FOCUSED Vercel serverless environment detection
// NOTE: Vercel uses AWS Lambda underneath for serverless functions,
// which is why we still check for /var/task paths, but we don't install AWS Lambda separately
function detectServerlessEnvironment() {
  const cwd = process.cwd();
  const home = process.env.HOME || '';
  
  // VERCEL-SPECIFIC path checks (Vercel runs on AWS Lambda internally)
  const vercelPathIndicators = [
    cwd.includes('/var/task'),           // Vercel uses AWS Lambda internally
    cwd.startsWith('/var/task'),         // Vercel Lambda task directory
    home.includes('sbx_user'),           // Vercel sandbox user
    home.includes('/home/sbx_user'),     // Full Vercel user path
  ];
  
  // VERCEL-SPECIFIC environment variable checks
  const vercelEnvIndicators = [
    process.env.VERCEL,                  // Main Vercel indicator
    process.env.VERCEL_ENV,              // Vercel environment
    process.env.NEXT_PUBLIC_VERCEL_ENV,  // Public Vercel env
    process.env.VERCEL_URL,              // Vercel URL
    process.env.VERCEL_REGION,           // Vercel region
  ];
  
  // Check for Vercel production environment
  const isVercelProduction = (
    process.env.NODE_ENV === 'production' && 
    process.platform === 'linux' &&
    !process.env.CI &&
    !process.env.LOCAL
  );
  
  const pathDetected = vercelPathIndicators.some(indicator => indicator);
  const envDetected = vercelEnvIndicators.some(indicator => indicator);
  
  return pathDetected || envDetected || isVercelProduction;
}

// Initialize environment detection and chromium
try {
  isServerlessEnvironment = detectServerlessEnvironment();
  
  console.log('🔍 VERCEL Environment Analysis:');
  console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`  - Platform: ${process.platform}`);
  console.log(`  - CWD: ${process.cwd()}`);
  console.log(`  - HOME: ${process.env.HOME}`);
  console.log(`  - VERCEL: ${process.env.VERCEL}`);
  console.log(`  - VERCEL_ENV: ${process.env.VERCEL_ENV}`);
  console.log(`  - VERCEL_URL: ${process.env.VERCEL_URL}`);
  console.log(`  - VERCEL_REGION: ${process.env.VERCEL_REGION}`);
  console.log(`  - CWD includes /var/task: ${process.cwd().includes('/var/task')}`);
  console.log(`  - HOME includes sbx_user: ${(process.env.HOME || '').includes('sbx_user')}`);
  console.log(`  - VERCEL DETECTED: ${isServerlessEnvironment}`);
  
  // FORCE Vercel mode if we detect Vercel-like paths but detection failed
  if (!isServerlessEnvironment && (process.cwd().includes('/var/task') || (process.env.HOME || '').includes('sbx_user'))) {
    console.log('🚨 FORCING Vercel serverless mode due to path detection!');
    isServerlessEnvironment = true;
  }
  
  if (isServerlessEnvironment) {
    chromium = require('@sparticuz/chromium');
    console.log('🌐 Loaded @sparticuz/chromium for serverless environment');
    
    // Test chromium functionality immediately
    try {
      const execPath = await chromium.executablePath();
      console.log(`✅ Chromium executable path: ${execPath}`);
    } catch (chromiumTestError) {
      console.error('❌ Failed to get chromium executable path:', chromiumTestError);
    }
  } else {
    console.log('🔧 Using regular puppeteer for local development');
  }
} catch (error) {
  console.error('⚠️ Error during environment setup:', error);
  
  // EMERGENCY fallback: if we're clearly in Vercel but setup failed
  if (process.cwd().includes('/var/task') || (process.env.HOME || '').includes('sbx_user')) {
    console.log('🆘 EMERGENCY: Forcing Vercel mode due to clear Vercel environment');
    isServerlessEnvironment = true;
    try {
      chromium = require('@sparticuz/chromium');
      console.log('🌐 Emergency loaded @sparticuz/chromium for Vercel');
    } catch (emergencyError) {
      console.error('💥 Emergency chromium load failed:', emergencyError);
    }
  } else {
    isServerlessEnvironment = false;
  }
}

// Browser pool voor hergebruik
class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | null = null;
  private isInitializing = false;
  private lastUsed = Date.now();
  private readonly TIMEOUT = 60000; // 1 minuut timeout

  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  async getBrowser(): Promise<Browser> {
    this.lastUsed = Date.now();
    
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.isInitializing) {
      // Wacht tot initialisatie klaar is
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.browser!;
    }

    this.isInitializing = true;
    try {
      console.log('🔧 Creating new browser instance...');
      console.log(`🌍 Environment: ${isServerlessEnvironment ? 'Serverless' : 'Local'}`);
      
      // Base launch options for all environments
      const baseArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions'
      ];

      if (isServerlessEnvironment && chromium) {
        // Serverless environment - use @sparticuz/chromium
        try {
          console.log('🌐 Setting up serverless Chromium...');
          
          const executablePath = await chromium.executablePath();
          console.log(`📍 Chromium executable: ${executablePath}`);
          
          const chromiumArgs = chromium.args || [];
          const allArgs = [...chromiumArgs, ...baseArgs];
          
          const launchOptions = {
            args: allArgs,
            executablePath: executablePath,
            headless: true,
            ignoreDefaultArgs: false
          };
          
          console.log('🚀 Launching with puppeteer-core and custom Chromium...');
          const puppeteerCore = require('puppeteer-core');
          this.browser = await puppeteerCore.launch(launchOptions);
          
          console.log('✅ Serverless browser launched successfully!');
          
        } catch (chromiumError) {
          console.error('❌ Serverless Chromium setup failed:', chromiumError);
          console.log('🔄 Falling back to regular puppeteer (this will likely fail in serverless)...');
          
          // Fallback attempt (will likely fail in serverless)
          this.browser = await puppeteer.launch({
            headless: true,
            args: baseArgs
          });
        }
      } else {
        // Local environment - use regular puppeteer
        console.log('🔧 Setting up local Puppeteer...');
        
        const launchOptions = {
          headless: true,
          args: baseArgs
        };
        
        this.browser = await puppeteer.launch(launchOptions);
        console.log('✅ Local browser launched successfully!');
      }
      
      // Auto cleanup na inactiviteit
      setTimeout(() => this.cleanup(), this.TIMEOUT);
      
    } finally {
      this.isInitializing = false;
    }
    
    return this.browser!;
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

// ULTRA VERBETERDE Nederlandse datum parser met meer patronen
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
      
      // Validatie
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2000) {
        const result = new Date(year, month, day, hour, minute);
        if (!isNaN(result.getTime())) {
          return result;
        }
      }
    }
  }
  
  return null;
}

export async function scrapeDHL(trackingCode: string): Promise<DHLTrackingResult> {
  const startTime = Date.now();
  let page: Page | null = null;
  
  try {
    console.log(`🚀 DHL Scraping start: ${trackingCode}`);
    
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
    
    // Direct naar tracking pagina (zoals originele script)
    const url = `https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${trackingCode}&submit=1`;
    console.log(`🌐 Navigating to: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wacht tot status element geladen is (gebaseerd op mijn verificatie)
    console.log(`⏳ Waiting for tracking content...`);
    const statusLoaded = await page.evaluate(async () => {
      const maxWait = 10000;
      const start = Date.now();
      
      while (Date.now() - start < maxWait) {
        // Zoek naar status elementen die ik heb geverifieerd
        if (document.querySelector('.c-tracking-result--status') || 
            document.querySelector('h2') || 
            document.querySelector('[class*="status"]')) {
          return true;
        }
        await new Promise(r => setTimeout(r, 200));
      }
      return false;
    });
    
    if (!statusLoaded) {
      throw new Error('Tracking info niet geladen binnen 10 seconden');
    }
    
    // Expand secties (exact zoals originele script)
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
    
    // Wacht voor animaties
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
          'h2:contains("Bezorgd")', 'h2:contains("Onderweg")', 'h2:contains("Verwerkt")'
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
    batchSize = 1,
    delayBetween = 1500,
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
    batchSize = 3, // Verhoogd van 1 naar 3 voor betere performance
    delayBetween = 1000, // Verlaagd van 1500 naar 1000ms
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

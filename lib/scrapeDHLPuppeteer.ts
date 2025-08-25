// lib/scrapeDHLPuppeteer.ts
import puppeteer from 'puppeteer';
import { DHLTrackingResult, DHLTrackingStatus, parseNLDate } from './scrapeDHL';

export async function scrapeDHLWithPuppeteer(trackingCode: string): Promise<DHLTrackingResult> {
  const startTime = Date.now();
  let browser;
  
  try {
    console.log(`🚀 DHL Puppeteer Scraping start for: ${trackingCode}`);
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: true, // Set to false for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Go to DHL tracking page
    const url = `https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${trackingCode}&submit=1`;
    console.log(`🌐 Navigating to: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for tracking results to load
    console.log(`⏳ Waiting for tracking results to load...`);
    
    try {
      // Wait for either results or error message
      await page.waitForSelector('.c-tracking-result--container, .js--tracking-result--container, [class*="tracking-result"], [class*="error"]', { timeout: 15000 });
    } catch (e) {
      console.log(`⚠️ No specific tracking container found, proceeding with full page analysis`);
    }
    
    // Give extra time for any async content to load
    await page.waitForTimeout(3000);
    
    // Extract tracking information
    const trackingData = await page.evaluate((code) => {
      console.log('🔍 Starting page evaluation for tracking code:', code);
      
      // Check if tracking code appears on page
      const pageContent = document.body.innerText;
      const hasTrackingCode = pageContent.includes(code);
      console.log('Tracking code found on page:', hasTrackingCode);
      
      // Look for status information
      const statusSelectors = [
        '[class*="tracking"] [class*="status"]',
        '[class*="delivery"] [class*="status"]',
        '[class*="shipment"] [class*="status"]',
        'h1, h2, h3, h4',
        '[class*="title"]',
        '[class*="headline"]',
        '[class*="result"]'
      ];
      
      const statusTexts: string[] = [];
      
      for (const selector of statusSelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          const text = el.textContent?.trim();
          if (text && text.length > 3 && text.length < 200 && !statusTexts.includes(text)) {
            statusTexts.push(text);
          }
        });
      }
      
      // Look for specific status keywords in all text
      const allText = pageContent.toLowerCase();
      const keywords = ['bezorgd', 'ingepland', 'cityhub', 'brievenbus', 'onderweg', 'afgeleverd', 'delivered'];
      const foundKeywords = keywords.filter(keyword => allText.includes(keyword));
      
      // Look for date/time information
      const dateElements = document.querySelectorAll('*');
      const potentialDates: string[] = [];
      
      const dateRegex = /\b\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}(?:\s+om\s+\d{1,2}:\d{2})?\b/gi;
      
      dateElements.forEach((el) => {
        const text = el.textContent?.trim();
        if (text) {
          const matches = text.match(dateRegex);
          if (matches) {
            matches.forEach(match => {
              if (!potentialDates.includes(match)) {
                potentialDates.push(match);
              }
            });
          }
        }
      });
      
      return {
        hasTrackingCode,
        statusTexts,
        foundKeywords,
        potentialDates,
        pageLength: pageContent.length,
        title: document.title,
        // Sample of page content for debugging
        contentSample: pageContent.substring(0, 500) + '...'
      };
    }, trackingCode);
    
    console.log(`📊 Extracted data for ${trackingCode}:`, {
      hasTrackingCode: trackingData.hasTrackingCode,
      statusCount: trackingData.statusTexts.length,
      keywordsFound: trackingData.foundKeywords,
      datesFound: trackingData.potentialDates.length,
      pageLength: trackingData.pageLength,
      title: trackingData.title
    });
    
    console.log(`📋 Status texts found:`, trackingData.statusTexts.slice(0, 10)); // Show first 10
    console.log(`📅 Dates found:`, trackingData.potentialDates);
    
    // Determine delivery status
    let deliveryStatus: DHLTrackingStatus = 'niet gevonden';
    
    const allFoundText = [...trackingData.statusTexts, ...trackingData.foundKeywords].join(' ').toLowerCase();
    
    // Enhanced status logic
    if (allFoundText.includes('ingepland') || allFoundText.includes('cityhub')) {
      deliveryStatus = 'onderweg';
      console.log(`📅 Status: onderweg (ingepland/cityhub detected)`);
    } else if (allFoundText.includes('bezorgd') || allFoundText.includes('delivered')) {
      deliveryStatus = 'bezorgd';
      console.log(`✅ Status: bezorgd`);
    } else if (allFoundText.includes('onderweg') || allFoundText.includes('transit')) {
      deliveryStatus = 'onderweg';
      console.log(`🚛 Status: onderweg`);
    } else if (!trackingData.hasTrackingCode || trackingData.pageLength < 1000) {
      deliveryStatus = 'niet gevonden';
      console.log(`❌ Status: niet gevonden`);
    } else {
      deliveryStatus = 'fout';
      console.log(`⚠️ Status: fout (unclear)`);
    }
    
    // Parse dates
    let afleverMoment: Date | null = null;
    let afgegevenMoment: Date | null = null;
    
    if (trackingData.potentialDates.length > 0) {
      // Try to parse the most recent date as delivery
      const dates = trackingData.potentialDates.map(dateStr => parseNLDate(dateStr)).filter(Boolean) as Date[];
      if (dates.length > 0) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        afgegevenMoment = dates[0]; // Earliest date as handoff
        if (dates.length > 1) {
          afleverMoment = dates[dates.length - 1]; // Latest date as delivery
        } else if (deliveryStatus === 'bezorgd') {
          afleverMoment = dates[0]; // Use same date if only one found and status is delivered
        }
      }
    }
    
    // Calculate duration
    let duration: string | undefined;
    let durationDays: number | undefined;
    
    if (afleverMoment && afgegevenMoment) {
      const durationMs = afleverMoment.getTime() - afgegevenMoment.getTime();
      durationDays = Math.max(0, durationMs / (1000 * 60 * 60 * 24));
      duration = durationDays >= 1 ? `${durationDays.toFixed(1)} dagen` : `${(durationMs / (1000 * 60 * 60)).toFixed(1)} uur`;
    } else {
      duration = deliveryStatus === 'bezorgd' ? 'Bezorgd (duur onbekend)' : 
                 deliveryStatus === 'onderweg' ? 'Nog onderweg' : 
                 'Kan niet bepaald worden';
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`📦 Puppeteer result for ${trackingCode}: ${deliveryStatus} (${processingTime}ms)`);
    
    return {
      deliveryStatus,
      afleverMoment,
      afgegevenMoment,
      statusTabel: trackingData.statusTexts,
      duration,
      durationDays,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Puppeteer error for ${trackingCode}:`, error);
    
    return {
      deliveryStatus: 'fout',
      afleverMoment: null,
      afgegevenMoment: null,
      statusTabel: [],
      duration: 'Kan niet bepaald worden (puppeteer fout)',
      durationDays: undefined,
      processingTime
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
} 
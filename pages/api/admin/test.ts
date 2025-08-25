// pages/api/admin/test.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { scrapeDHL } from '@/lib/scrapeDHL';
import { sendMandrillEmail } from '@/lib/sendMandrillMail';
import { wcApi } from '@/lib/woocommerce';
import { getCustomerIdByEmail } from '@/lib/getCustomerIdByEmail';
import { addPointsToCustomer } from '@/lib/addPointsToCustomer';
import { requireAdminAuth } from '../../../lib/adminAuth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { testType, payload } = req.body;

    switch (testType) {
      case 'database':
        return await testDatabase(res);
      case 'dhl_scraping':
        return await testDHLScraping(res, payload?.trackingCode);
      case 'mandrill':
        return await testMandrill(res, payload);
      case 'woocommerce':
        return await testWooCommerce(res, payload?.email);
      case 'full_system':
        return await testFullSystem(res, payload);
      case 'simulate_scenario':
        return await simulateScenario(res, payload);
      default:
        return res.status(400).json({ error: 'Unknown test type' });
    }
  } catch (error) {
    console.error('Test API error:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Test database connectie en queries
async function testDatabase(res: NextApiResponse) {
  const results = {
    connection: false,
    tracking_matches: false,
    tracking_logs: false,
    system_settings: false,
    admin_logs: false,
    errors: [] as string[]
  };

  try {
    // Test basis connectie
    const { data: testData, error: testError } = await supabase.from('tracking_matches').select('count(*)', { count: 'exact', head: true });
    if (testError) throw new Error(`Connection test failed: ${testError.message}`);
    results.connection = true;

    // Test tracking_matches
    const { data: matches, error: matchesError } = await supabase.from('tracking_matches').select('*').limit(1);
    if (matchesError) results.errors.push(`tracking_matches: ${matchesError.message}`);
    else results.tracking_matches = true;

    // Test tracking_logs
    const { data: logs, error: logsError } = await supabase.from('tracking_logs').select('*').limit(1);
    if (logsError) results.errors.push(`tracking_logs: ${logsError.message}`);
    else results.tracking_logs = true;

    // Test system_settings
    const { data: settings, error: settingsError } = await supabase.from('system_settings').select('*').limit(1);
    if (settingsError) results.errors.push(`system_settings: ${settingsError.message}`);
    else results.system_settings = true;

    // Test admin_logs
    const { data: adminLogs, error: adminLogsError } = await supabase.from('admin_logs').select('*').limit(1);
    if (adminLogsError) results.errors.push(`admin_logs: ${adminLogsError.message}`);
    else results.admin_logs = true;

  } catch (error) {
    results.errors.push(error instanceof Error ? error.message : 'Unknown database error');
  }

  return res.status(200).json({
    testType: 'database',
    success: results.connection && results.errors.length === 0,
    results
  });
}

// Test DHL scraping
async function testDHLScraping(res: NextApiResponse, trackingCode?: string) {
  const testCode = trackingCode || '3SDFC0681190456'; // Default test code
  
  const startTime = Date.now();
  const result = await scrapeDHL(testCode);
  const processingTime = Date.now() - startTime;

  const success = result.deliveryStatus !== 'fout';

  // Calculate additional metrics
  const metrics = {
    hasDeliveryMoment: !!result.afleverMoment,
    hasHandoffMoment: !!result.afgegevenMoment,
    canCalculateDuration: !!(result.afleverMoment && result.afgegevenMoment),
    statusEntriesFound: result.statusTabel.length
  };

  // Format timestamps for better display
  const formatDateTime = (date: Date | null): string | null => {
    return date ? date.toLocaleString('nl-NL', {
      weekday: 'long',
      day: 'numeric', 
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : null;
  };

  return res.status(200).json({
    testType: 'dhl_scraping',
    success,
    results: {
      trackingCode: testCode,
      deliveryStatus: result.deliveryStatus,
      afleverMoment: result.afleverMoment,
      afgegevenMoment: result.afgegevenMoment,
      statusTabel: result.statusTabel,
      duration: result.duration, // From DHL parsing
      durationDays: result.durationDays,
      processingTime: `${processingTime}ms`,
      
      // Enhanced display information
      display: {
        afleverMomentFormatted: formatDateTime(result.afleverMoment),
        afgegevenMomentFormatted: formatDateTime(result.afgegevenMoment),
        durationHuman: result.duration || 'Kan niet berekend worden',
        durationPrecise: result.durationDays ? `${result.durationDays.toFixed(2)} dagen` : null
      },
      
      // Test metrics
      metrics
    }
  });
}

// Test Mandrill email
async function testMandrill(res: NextApiResponse, payload: any) {
  const { 
    email = 'test@example.com', 
    template = 'dag3_notify',
    firstName = 'Test Gebruiker'
  } = payload || {};

  try {
    await sendMandrillEmail({
      to: { email, name: firstName },
      templateName: template,
      mergeVars: {
        first_name: firstName,
        order_id: '12345',
        tracking_code: '3SDFC123456789',
        button_url_1: 'https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=12345',
        button_url_2: 'https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=12345',
        button_url_3: 'https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=12345'
      }
    });

    return res.status(200).json({
      testType: 'mandrill',
      success: true,
      results: {
        emailSent: true,
        recipient: email,
        template,
        message: 'Test email sent successfully'
      }
    });
  } catch (error) {
    return res.status(200).json({
      testType: 'mandrill',
      success: false,
      results: {
        emailSent: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

// Test WooCommerce API
async function testWooCommerce(res: NextApiResponse, email?: string) {
  const testEmail = email || 'test@wasgeurtje.nl';
  const results = {
    connection: false,
    customerLookup: false,
    pointsSystem: false,
    orderCreation: false,
    errors: [] as string[]
  };

  try {
    // Test basis WooCommerce connectie
    const { data: storeInfo } = await wcApi.get('');
    results.connection = true;

    // Test customer lookup
    try {
      const customerId = await getCustomerIdByEmail(testEmail);
      results.customerLookup = customerId !== null;
    } catch (error) {
      results.errors.push(`Customer lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test product lookup (vervangingsproduct)
    try {
      const { data: product } = await wcApi.get('products/1893');
      if (product.id) {
        results.orderCreation = true;
      }
    } catch (error) {
      results.errors.push(`Product lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

  } catch (error) {
    results.errors.push(`WooCommerce connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return res.status(200).json({
    testType: 'woocommerce',
    success: results.connection && results.errors.length === 0,
    results
  });
}

// Test volledige systeem
async function testFullSystem(res: NextApiResponse, payload: any) {
  const { trackingCode = '3SDFC0681190456' } = payload || {};
  
  const results = {
    database: false,
    dhl: false,
    mandrill: false,
    woocommerce: false,
    overall: false,
    errors: [] as string[]
  };

  // Test alle componenten
  try {
    // Database test - NOW WITH PROPER ERROR CHECKING
    const { data: testConn, error: dbError } = await supabase.from('tracking_matches').select('count(*)', { count: 'exact', head: true });
    if (dbError) {
      results.errors.push(`Database: ${dbError.message}`);
      results.database = false;
    } else {
      results.database = true;
    }

    // DHL test
    const dhlResult = await scrapeDHL(trackingCode);
    if (dhlResult.deliveryStatus === 'fout') {
      results.errors.push(`DHL: Scraping failed for ${trackingCode}`);
      results.dhl = false;
    } else {
      results.dhl = true;
    }

    // Mandrill test - check if API key is configured
    if (!process.env.MANDRILL_API_KEY) {
      results.errors.push('Mandrill: API key not configured');
      results.mandrill = false;
    } else {
      results.mandrill = true; // Assume working if configured (to avoid sending test emails)
    }

    // WooCommerce test
    try {
      await wcApi.get('');
      results.woocommerce = true;
    } catch (error) {
      results.errors.push(`WooCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results.woocommerce = false;
    }

    results.overall = results.database && results.dhl && results.mandrill && results.woocommerce;

  } catch (error) {
    results.errors.push(`System: ${error instanceof Error ? error.message : 'Unknown error'}`);
    results.overall = false;
  }

  return res.status(200).json({
    testType: 'full_system',
    success: results.overall,
    results
  });
}

// Simuleer scenario (dag 3, 5, of 10)
async function simulateScenario(res: NextApiResponse, payload: any) {
  const { trackingCode, day, action = 'email' } = payload || {};
  
  if (!trackingCode || !day) {
    return res.status(400).json({ error: 'trackingCode and day required' });
  }

  try {
    // Haal tracking match op
    const { data: match, error } = await supabase
      .from('tracking_matches')
      .select('*')
      .eq('tracking_code', trackingCode)
      .single();

    if (error || !match) {
      return res.status(404).json({ error: 'Tracking not found' });
    }

    const results = {
      trackingCode,
      day,
      action,
      emailSent: false,
      logged: false
    };

    if (action === 'email') {
      // Bepaal template op basis van dag
      let template = '';
      switch (day) {
        case 3:
          template = 'dag3_notify';
          break;
        case 5:
          template = 'dag5_choice';
          break;
        case 10:
          template = 'dag10_gift_notice';
          break;
        default:
          throw new Error('Invalid day, must be 3, 5, or 10');
      }

      // Verstuur email
      await sendMandrillEmail({
        to: { email: match.email, name: match.first_name },
        templateName: template,
        mergeVars: {
          first_name: match.first_name,
          order_id: match.order_id,
          tracking_code: match.tracking_code,
          button_url_1: `https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=${match.order_id}`,
          button_url_2: `https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=${match.order_id}`,
          button_url_3: `https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=${match.order_id}`
        }
      });

      results.emailSent = true;

      // Log actie
      await supabase.from('tracking_logs').insert({
        tracking_code: trackingCode,
        order_id: match.order_id?.toString() || 'unknown',
        email: match.email,
        action_type: `simulation_day${day}`,
        details: {
          simulated: true,
          day,
          template_used: template,
          timestamp: new Date().toISOString()
        }
      });

      results.logged = true;
    }

    return res.status(200).json({
      testType: 'simulate_scenario',
      success: true,
      results
    });

  } catch (error) {
    return res.status(500).json({
      testType: 'simulate_scenario',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 
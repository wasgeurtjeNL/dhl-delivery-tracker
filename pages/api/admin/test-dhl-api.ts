// pages/api/admin/test-dhl-api.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { scrapeDHLWithOfficialAPI } from '@/lib/scrapeDHL';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { trackingCode } = req.body;

    if (!trackingCode) {
      return res.status(400).json({ error: 'Tracking code is required' });
    }

    // DEBUG: Check environment variable
    console.log(`🔍 DHL_API_KEY in API route: ${process.env.DHL_API_KEY ? 'FOUND' : 'MISSING'}`);
    console.log(`🔍 All env vars:`, Object.keys(process.env).filter(key => key.includes('DHL')));

    console.log(`🧪 Testing DHL Official API for: ${trackingCode}`);

    // Test de nieuwe DHL API functie
    const result = await scrapeDHLWithOfficialAPI(trackingCode);
    
    console.log(`🧪 Test result for ${trackingCode}:`, {
      status: result.deliveryStatus,
      events: result.statusTabel.length,
      afleverMoment: result.afleverMoment,
      afgegevenMoment: result.afgegevenMoment,
      duration: result.duration,
      processingTime: result.processingTime
    });

    res.status(200).json({
      success: true,
      trackingCode,
      result: {
        deliveryStatus: result.deliveryStatus,
        afleverMoment: result.afleverMoment,
        afgegevenMoment: result.afgegevenMoment,
        statusTabel: result.statusTabel,
        duration: result.duration,
        durationDays: result.durationDays,
        processingTime: result.processingTime
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ DHL API test failed:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 
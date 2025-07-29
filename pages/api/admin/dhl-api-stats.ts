// pages/api/admin/dhl-api-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdminAuth } from '../../../lib/adminAuth';
import { getDHLApiStats } from '../../../lib/dhlApiLogger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get stats from database instead of in-memory
    const stats = await getDHLApiStats();
    
    return res.status(200).json({
      success: true,
      stats: {
        primaryKeyCalls: stats.primaryKeyCalls,
        secondaryKeyCalls: stats.secondaryKeyCalls,
        totalCalls: stats.totalCalls,
        currentKey: stats.currentKey,
        lastReset: stats.lastReset,
        callLimit: stats.callLimit,
        primaryKeyAvailable: stats.primaryKeyAvailable,
        secondaryKeyAvailable: stats.secondaryKeyAvailable,
        hoursSinceReset: stats.hoursSinceReset
      }
    });
  } catch (error) {
    console.error('DHL API Stats error:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch DHL API stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
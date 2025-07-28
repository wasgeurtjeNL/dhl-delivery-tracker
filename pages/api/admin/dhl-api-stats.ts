// pages/api/admin/dhl-api-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdminAuth } from '../../../lib/adminAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Import the scrapeDHL module to access API stats
    const { getDHLApiStats } = await import('../../../lib/scrapeDHL');
    
    const stats = getDHLApiStats();
    
    return res.status(200).json({
      success: true,
      stats: {
        primaryKeyCalls: stats.primaryKeyCalls,
        secondaryKeyCalls: stats.secondaryKeyCalls,
        totalCalls: stats.primaryKeyCalls + stats.secondaryKeyCalls,
        currentKey: stats.currentKey,
        lastReset: stats.lastReset,
        callLimit: parseInt(process.env.DHL_API_CALL_LIMIT || '250'),
        primaryKeyAvailable: !!process.env.DHL_API_KEY,
        secondaryKeyAvailable: !!process.env.DHL_API_KEY_SECONDARY,
        hoursSinceReset: Math.round((new Date().getTime() - stats.lastReset.getTime()) / (1000 * 60 * 60) * 10) / 10
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
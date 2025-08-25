// pages/api/replacement/products.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { wooCommerceService } from '@/lib/woocommerceService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📦 Fetching replacement products...');

    // Haal alle toegestane replacement producten op
    const products = await wooCommerceService.getReplacementProducts();

    console.log(`✅ Retrieved ${products.length} replacement products`);

    return res.status(200).json({
      success: true,
      products,
      total: products.length,
      allowed_product_ids: [1410, 1417, 1425, 1423, 1427, 1893, 334999, 273950, 273949, 273942, 273946, 273947, 267628, 44876, 335060, 335706]
    });

  } catch (error) {
    console.error('❌ Failed to fetch replacement products:', error);
    
    return res.status(500).json({ 
      error: 'Failed to fetch replacement products',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
// pages/api/admin/mandrill-templates-list.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdminAuth } from '@/lib/adminAuth';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.MANDRILL_API_KEY) {
      return res.status(500).json({ 
        error: 'Mandrill API key not configured' 
      });
    }

    console.log('🔍 Fetching all available Mandrill templates...');

    // Haal alle beschikbare templates op van Mandrill
    const endpoint = 'https://mandrillapp.com/api/1.0/templates/list.json';
    
    const { data } = await axios.post(endpoint, {
      key: process.env.MANDRILL_API_KEY
    });

    console.log(`✅ Found ${data.length} templates in Mandrill account`);

    // Format de response
    const templates = data.map((template: any) => ({
      name: template.name,
      slug: template.slug,
      subject: template.subject,
      publish_name: template.publish_name,
      created_at: template.created_at,
      updated_at: template.updated_at,
      published_at: template.published_at
    }));

    return res.status(200).json({
      success: true,
      total: templates.length,
      templates,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to fetch Mandrill templates:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }

    return res.status(500).json({ 
      error: 'Failed to fetch templates',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: axios.isAxiosError(error) ? error.response?.data : null
    });
  }
} 
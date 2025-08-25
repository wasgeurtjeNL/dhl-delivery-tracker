import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminAuthenticated } from '../../../lib/adminAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const authenticated = isAdminAuthenticated(req);
    
    return res.status(200).json({ 
      authenticated,
      success: true 
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return res.status(500).json({ 
      authenticated: false,
      success: false, 
      message: 'Er is een serverfout opgetreden' 
    });
  }
} 
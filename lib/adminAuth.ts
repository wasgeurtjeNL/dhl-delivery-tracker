import { NextApiRequest } from 'next';
import { parse } from 'cookie';

export function isAdminAuthenticated(req: NextApiRequest): boolean {
  try {
    const cookies = parse(req.headers.cookie || '');
    const sessionToken = cookies['admin-session'];
    
    if (!sessionToken) {
      return false;
    }
    
    // Decode and validate session token
    const decoded = Buffer.from(sessionToken, 'base64').toString();
    const [email, timestamp] = decoded.split(':');
    
    // Check if it's the correct admin email
    if (email !== 'info@wasgeurtje.nl') {
      return false;
    }
    
    // Check if session hasn't expired (7 days)
    const sessionTime = parseInt(timestamp);
    const now = Date.now();
    const sevenDays = 60 * 60 * 24 * 7 * 1000; // 7 days in milliseconds
    
    if (now - sessionTime > sevenDays) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

export function requireAdminAuth(req: NextApiRequest) {
  if (!isAdminAuthenticated(req)) {
    throw new Error('Unauthorized');
  }
} 
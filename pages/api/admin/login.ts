import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

const ADMIN_EMAIL = 'info@wasgeurtje.nl';
const ADMIN_PASSWORD = 'Haspelsstraat1!';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Validate credentials
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      // Create a simple session token (in production, use proper JWT or session management)
      const sessionToken = Buffer.from(`${email}:${Date.now()}`).toString('base64');
      
      // Set HTTP-only cookie for authentication
      const cookie = serialize('admin-session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });

      res.setHeader('Set-Cookie', cookie);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Login successful' 
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        message: 'Ongeldige inloggegevens' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Er is een serverfout opgetreden' 
    });
  }
} 
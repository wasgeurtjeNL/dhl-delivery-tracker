// pages/api/admin/email-template-verification.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendMandrillEmail } from '@/lib/sendMandrillMail';
import { requireAdminAuth } from '@/lib/adminAuth';
import axios from 'axios';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TemplateInfo {
  name: string;
  exists: boolean;
  testEmailSent: boolean;
  error?: string;
  mandrill_id?: string;
  created_at?: string;
  publish_name?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    switch (req.method) {
      case 'GET':
        return await verifyAllTemplates(res);
      case 'POST':
        return await sendTestEmail(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Email template verification error:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to verify email templates',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function verifyAllTemplates(res: NextApiResponse) {
  try {
    // Haal huidige template instellingen op
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('email_template_day3, email_template_day5, email_template_day10')
      .limit(1)
      .single();

    if (settingsError) {
      throw new Error(`Failed to fetch template settings: ${settingsError.message}`);
    }

    const templatestoCheck = [
      {
        name: settings.email_template_day3 || 'dag3_notify',
        purpose: 'Day 3 Heads-up Email',
        mergeVars: ['first_name', 'order_id', 'tracking_code']
      },
      {
        name: settings.email_template_day5 || 'dag5_choice', 
        purpose: 'Day 5 Choice Email',
        mergeVars: ['first_name', 'order_id', 'button_url_1', 'button_url_2', 'button_url_3']
      },
      {
        name: settings.email_template_day10 || 'dag10_gift_notice',
        purpose: 'Day 10 Gift Notice',
        mergeVars: ['first_name', 'order_id']
      }
    ];

    const verificationResults: (TemplateInfo & { purpose: string, mergeVars: string[] })[] = [];

    // Controleer elke template in Mandrill
    for (const template of templatestoCheck) {
      try {
        const templateInfo = await checkMandrillTemplate(template.name);
        verificationResults.push({
          ...templateInfo,
          purpose: template.purpose,
          mergeVars: template.mergeVars
        });
      } catch (error) {
        verificationResults.push({
          name: template.name,
          exists: false,
          testEmailSent: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          purpose: template.purpose,
          mergeVars: template.mergeVars
        });
      }
    }

    // Check environment setup
    const envCheck = {
      mandrill_api_key: !!process.env.MANDRILL_API_KEY,
      mandrill_key_format: process.env.MANDRILL_API_KEY?.startsWith('md-') || false,
      from_email: 'info@wasgeurtje.nl',
      from_name: 'Wasgeurtje.nl'
    };

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: envCheck,
      templates: verificationResults,
      summary: {
        total: verificationResults.length,
        existing: verificationResults.filter(t => t.exists).length,
        missing: verificationResults.filter(t => !t.exists).length,
        allValid: verificationResults.every(t => t.exists)
      }
    });

  } catch (error) {
    console.error('❌ Template verification failed:', error);
    throw error;
  }
}

async function checkMandrillTemplate(templateName: string): Promise<TemplateInfo> {
  const endpoint = 'https://mandrillapp.com/api/1.0/templates/info.json';
  
  try {
    const { data } = await axios.post(endpoint, {
      key: process.env.MANDRILL_API_KEY,
      name: templateName
    });

    return {
      name: templateName,
      exists: true,
      testEmailSent: false,
      mandrill_id: data.slug,
      created_at: data.created_at,
      publish_name: data.publish_name
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 500) {
      // Mandrill returns 500 for non-existent templates
      return {
        name: templateName,
        exists: false,
        testEmailSent: false,
        error: 'Template does not exist in Mandrill'
      };
    }
    throw error;
  }
}

async function sendTestEmail(req: NextApiRequest, res: NextApiResponse) {
  const { templateName, testEmail, mergeVars } = req.body;

  if (!templateName || !testEmail) {
    return res.status(400).json({ 
      error: 'templateName and testEmail are required' 
    });
  }

  try {
    // Verstuur test email
    const result = await sendMandrillEmail({
      to: { 
        email: testEmail, 
        name: 'Test User' 
      },
      templateName,
      mergeVars: {
        first_name: 'Test User',
        order_id: '12345',
        tracking_code: '3STBDG0123456789',
        button_url_1: 'https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=12345',
        button_url_2: 'https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=12345', 
        button_url_3: 'https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=12345',
        ...mergeVars
      }
    });

    // Log test email
    await supabase.from('admin_logs').insert({
      action: 'test_email_sent',
      details: {
        template: templateName,
        test_email: testEmail,
        mandrill_response: result,
        timestamp: new Date().toISOString()
      },
      created_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: `Test email sent successfully to ${testEmail}`,
      templateName,
      mandrillResponse: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Failed to send test email for template ${templateName}:`, error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      templateName,
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 
// pages/api/admin/email-test.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSupabaseEmailWithRetry } from '@/lib/sendSupabaseEmailWithRetry';
import { requireAdminAuth } from '@/lib/adminAuth';

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

    const { action, testEmail, templateType, customMergeVars } = req.body;

    switch (action) {
      case 'test_single_template':
        return await testSingleTemplate(res, testEmail, templateType, customMergeVars);
      case 'test_all_templates':
        return await testAllTemplates(res, testEmail);
      case 'test_email_flow':
        return await testEmailFlow(res, testEmail);
      case 'validate_templates':
        return await validateAllTemplates(res);
      default:
        return res.status(400).json({ error: 'Unknown test action' });
    }

  } catch (error) {
    console.error('Email test error:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to execute email test',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function testSingleTemplate(
  res: NextApiResponse, 
  testEmail: string, 
  templateType: string,
  customMergeVars?: Record<string, string>
) {
  if (!testEmail || !templateType) {
    return res.status(400).json({ 
      error: 'testEmail and templateType are required' 
    });
  }

  try {
    // Default merge variables
    const defaultMergeVars = {
      first_name: 'Test User',
      order_id: '12345',
      tracking_code: '3STBDG0123456789',
      button_url_1: 'https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=12345',
      button_url_2: 'https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=12345',
      button_url_3: 'https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=12345'
    };

    const mergeVars = { ...defaultMergeVars, ...customMergeVars };

    console.log(`🧪 Testing template: ${templateType} to ${testEmail}`);

    const result = await sendSupabaseEmailWithRetry({
      to: { 
        email: testEmail, 
        name: 'Test User' 
      },
      templateType,
      mergeVars
    });

    // Log test in admin logs
    await supabase.from('admin_logs').insert({
      action: 'email_template_test',
      details: {
        template_type: templateType,
        test_email: testEmail,
        merge_vars: mergeVars,
        result: result
      },
      created_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: `Test email sent successfully: ${templateType}`,
      templateType,
      recipient: testEmail,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Failed to send test email for ${templateType}:`, error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      templateType,
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

async function testAllTemplates(res: NextApiResponse, testEmail: string) {
  if (!testEmail) {
    return res.status(400).json({ error: 'testEmail is required' });
  }

  try {
    // Haal alle actieve templates op
    const { data: templates, error } = await supabase
      .from('email_templates')
      .select('template_type, display_name')
      .eq('is_active', true)
      .order('template_type');

    if (error || !templates || templates.length === 0) {
      throw new Error('No active templates found');
    }

    const results = [];
    
    console.log(`🧪 Testing all ${templates.length} templates to ${testEmail}`);

    for (const template of templates) {
      try {
        const result = await sendSupabaseEmailWithRetry({
          to: { 
            email: testEmail, 
            name: 'Test User (All Templates)' 
          },
          templateType: template.template_type,
          mergeVars: {
            first_name: 'Test User',
            order_id: '12345',
            tracking_code: '3STBDG0123456789',
            button_url_1: 'https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=12345',
            button_url_2: 'https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=12345',
            button_url_3: 'https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=12345'
          }
        });

        results.push({
          template_type: template.template_type,
          display_name: template.display_name,
          success: true,
          result
        });

        // Small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        results.push({
          template_type: template.template_type,
          display_name: template.display_name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Log comprehensive test
    await supabase.from('admin_logs').insert({
      action: 'email_all_templates_test',
      details: {
        test_email: testEmail,
        total_templates: templates.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      },
      created_at: new Date().toISOString()
    });

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: failureCount === 0,
      message: `Sent ${successCount}/${templates.length} test emails successfully`,
      summary: {
        total: templates.length,
        successful: successCount,
        failed: failureCount
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to test all templates:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to test all templates',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

async function testEmailFlow(res: NextApiResponse, testEmail: string) {
  if (!testEmail) {
    return res.status(400).json({ error: 'testEmail is required' });
  }

  try {
    console.log(`🧪 Testing complete email flow simulation to ${testEmail}`);

    const flowResults = [];

    // Simuleer dag 3 email
    try {
      const day3Result = await sendSupabaseEmailWithRetry({
        to: { email: testEmail, name: 'Flow Test User' },
        templateType: 'day3_notify',
        mergeVars: {
          first_name: 'Flow Test User',
          order_id: 'FLOW12345',
          tracking_code: '3STFLOWTEST123'
        }
      });

      flowResults.push({
        step: 'day3_notify',
        description: 'Day 3 heads-up email',
        success: true,
        result: day3Result
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      flowResults.push({
        step: 'day3_notify',
        description: 'Day 3 heads-up email',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Simuleer dag 5 email
    try {
      const day5Result = await sendSupabaseEmailWithRetry({
        to: { email: testEmail, name: 'Flow Test User' },
        templateType: 'day5_choice',
        mergeVars: {
          first_name: 'Flow Test User',
          order_id: 'FLOW12345',
          button_url_1: 'https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=FLOW12345',
          button_url_2: 'https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=FLOW12345',
          button_url_3: 'https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=FLOW12345'
        }
      });

      flowResults.push({
        step: 'day5_choice',
        description: 'Day 5 choice email with buttons',
        success: true,
        result: day5Result
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      flowResults.push({
        step: 'day5_choice',
        description: 'Day 5 choice email with buttons',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Simuleer dag 10 email
    try {
      const day10Result = await sendSupabaseEmailWithRetry({
        to: { email: testEmail, name: 'Flow Test User' },
        templateType: 'day10_gift_notice',
        mergeVars: {
          first_name: 'Flow Test User',
          order_id: 'FLOW12345'
        }
      });

      flowResults.push({
        step: 'day10_gift_notice',
        description: 'Day 10 automatic gift notice',
        success: true,
        result: day10Result
      });
    } catch (error) {
      flowResults.push({
        step: 'day10_gift_notice',
        description: 'Day 10 automatic gift notice',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Log flow test
    await supabase.from('admin_logs').insert({
      action: 'email_flow_test',
      details: {
        test_email: testEmail,
        flow_results: flowResults,
        total_steps: flowResults.length,
        successful_steps: flowResults.filter(r => r.success).length
      },
      created_at: new Date().toISOString()
    });

    const successCount = flowResults.filter(r => r.success).length;

    return res.status(200).json({
      success: successCount === flowResults.length,
      message: `Email flow test completed: ${successCount}/${flowResults.length} steps successful`,
      flow_results: flowResults,
      summary: {
        total_steps: flowResults.length,
        successful: successCount,
        failed: flowResults.length - successCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to test email flow:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to test email flow',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

async function validateAllTemplates(res: NextApiResponse) {
  try {
    // Haal alle templates op en valideer ze
    const { data: templates, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    const validationResults = templates.map(template => {
      const issues = [];

      // Check required fields
      if (!template.subject) issues.push('Missing subject');
      if (!template.html_content) issues.push('Missing HTML content');
      if (!template.merge_variables || template.merge_variables.length === 0) {
        issues.push('No merge variables defined');
      }

      // Check for common merge variables in content
      const htmlContent = template.html_content.toLowerCase();
      template.merge_variables.forEach((variable: string) => {
        if (!htmlContent.includes(`{{${variable}}}`)) {
          issues.push(`Merge variable {{${variable}}} not found in HTML content`);
        }
      });

      return {
        template_type: template.template_type,
        display_name: template.display_name,
        valid: issues.length === 0,
        issues
      };
    });

    const validCount = validationResults.filter(r => r.valid).length;

    return res.status(200).json({
      success: true,
      message: `Template validation completed: ${validCount}/${templates.length} templates valid`,
      validation_results: validationResults,
      summary: {
        total: templates.length,
        valid: validCount,
        invalid: templates.length - validCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to validate templates:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to validate templates',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 
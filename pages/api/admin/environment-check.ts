// pages/api/admin/environment-check.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/adminAuth';
import axios from 'axios';

interface EnvironmentCheck {
  category: string;
  name: string;
  required: boolean;
  status: 'valid' | 'invalid' | 'warning' | 'testing';
  value?: string;
  message?: string;
  details?: any;
}

interface ValidationResult {
  success: boolean;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
  };
  checks: EnvironmentCheck[];
  recommendations: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🔍 Starting comprehensive environment validation...');

    const checks: EnvironmentCheck[] = [];
    const recommendations: string[] = [];

    // 1. Basic Environment Variables
    await validateBasicEnvVars(checks);
    
    // 2. Database Connectivity
    await validateDatabase(checks);
    
    // 3. Email Service (Mandrill)
    await validateEmailService(checks);
    
    // 4. WooCommerce API
    await validateWooCommerce(checks);
    
    // 5. Domain & Security
    await validateDomainSecurity(checks);
    
    // 6. Email Templates
    await validateEmailTemplates(checks);

    // Generate recommendations
    generateRecommendations(checks, recommendations);

    const summary = {
      total: checks.length,
      valid: checks.filter(c => c.status === 'valid').length,
      invalid: checks.filter(c => c.status === 'invalid').length,
      warnings: checks.filter(c => c.status === 'warning').length
    };

    const result: ValidationResult = {
      success: summary.invalid === 0,
      summary,
      checks,
      recommendations
    };

    console.log(`✅ Environment validation completed: ${summary.valid}/${summary.total} valid`);

    return res.status(200).json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to validate environment',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function validateBasicEnvVars(checks: EnvironmentCheck[]) {
  const envVars = [
    { name: 'NODE_ENV', required: true, category: 'Basic' },
    { name: 'SUPABASE_URL', required: true, category: 'Database' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, category: 'Database' },
    { name: 'MANDRILL_API_KEY', required: true, category: 'Email' },
    { name: 'WOOCOMMERCE_URL', required: false, category: 'WooCommerce' },
    { name: 'WOOCOMMERCE_CONSUMER_KEY', required: false, category: 'WooCommerce' },
    { name: 'WOOCOMMERCE_CONSUMER_SECRET', required: false, category: 'WooCommerce' }
  ];

  for (const envVar of envVars) {
    const value = process.env[envVar.name];
    
    if (!value && envVar.required) {
      checks.push({
        category: envVar.category,
        name: envVar.name,
        required: envVar.required,
        status: 'invalid',
        message: 'Environment variable not set'
      });
    } else if (!value && !envVar.required) {
      checks.push({
        category: envVar.category,
        name: envVar.name,
        required: envVar.required,
        status: 'warning',
        message: 'Optional variable not set'
      });
    } else {
      // Basic format validation
      let status: 'valid' | 'warning' = 'valid';
      let message = 'Environment variable set';

      if (envVar.name === 'MANDRILL_API_KEY' && value && !value.startsWith('md-')) {
        status = 'warning';
        message = 'API key format might be incorrect (should start with md-)';
      }

      if (envVar.name === 'SUPABASE_URL' && value && !value.startsWith('https://')) {
        status = 'warning';
        message = 'URL should use HTTPS';
      }

      checks.push({
        category: envVar.category,
        name: envVar.name,
        required: envVar.required,
        status,
        value: value ? `${value.substring(0, 8)}...` : undefined,
        message
      });
    }
  }
}

async function validateDatabase(checks: EnvironmentCheck[]) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Test connection
    const { data, error } = await supabase.from('system_settings').select('id').limit(1);
    
    if (error) {
      checks.push({
        category: 'Database',
        name: 'Supabase Connection',
        required: true,
        status: 'invalid',
        message: `Connection failed: ${error.message}`
      });
    } else {
      checks.push({
        category: 'Database',
        name: 'Supabase Connection',
        required: true,
        status: 'valid',
        message: 'Database connection successful'
      });
    }

    // Check required tables
    const requiredTables = ['email_templates', 'email_logs', 'system_settings', 'tracking_matches', 'tracking_logs'];
    
    for (const table of requiredTables) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        
        if (error) {
          checks.push({
            category: 'Database',
            name: `Table: ${table}`,
            required: true,
            status: 'invalid',
            message: `Table access failed: ${error.message}`
          });
        } else {
          checks.push({
            category: 'Database',
            name: `Table: ${table}`,
            required: true,
            status: 'valid',
            message: 'Table accessible'
          });
        }
      } catch (err) {
        checks.push({
          category: 'Database',
          name: `Table: ${table}`,
          required: true,
          status: 'invalid',
          message: `Table check failed: ${err}`
        });
      }
    }

  } catch (error) {
    checks.push({
      category: 'Database',
      name: 'Supabase Setup',
      required: true,
      status: 'invalid',
      message: `Database setup failed: ${error}`
    });
  }
}

async function validateEmailService(checks: EnvironmentCheck[]) {
  const apiKey = process.env.MANDRILL_API_KEY;
  
  if (!apiKey) {
    checks.push({
      category: 'Email',
      name: 'Mandrill API Test',
      required: true,
      status: 'invalid',
      message: 'No API key available'
    });
    return;
  }

  try {
    // Test Mandrill API connectivity
    const response = await axios.post('https://mandrillapp.com/api/1.0/users/ping.json', {
      key: apiKey
    });

    if (response.data === 'PONG!') {
      checks.push({
        category: 'Email',
        name: 'Mandrill API Test',
        required: true,
        status: 'valid',
        message: 'API connection successful'
      });
    } else {
      checks.push({
        category: 'Email',
        name: 'Mandrill API Test',
        required: true,
        status: 'warning',
        message: 'Unexpected API response'
      });
    }

    // Test account info
    try {
      const infoResponse = await axios.post('https://mandrillapp.com/api/1.0/users/info.json', {
        key: apiKey
      });

      const accountInfo = infoResponse.data;
      checks.push({
        category: 'Email',
        name: 'Mandrill Account',
        required: true,
        status: 'valid',
        message: `Account: ${accountInfo.username} (${accountInfo.reputation}% reputation)`,
        details: {
          username: accountInfo.username,
          reputation: accountInfo.reputation,
          hourly_quota: accountInfo.hourly_quota,
          backlog: accountInfo.backlog
        }
      });

    } catch (err) {
      checks.push({
        category: 'Email',
        name: 'Mandrill Account',
        required: false,
        status: 'warning',
        message: 'Could not fetch account details'
      });
    }

  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 500) {
      checks.push({
        category: 'Email',
        name: 'Mandrill API Test',
        required: true,
        status: 'invalid',
        message: 'Invalid API key'
      });
    } else {
      checks.push({
        category: 'Email',
        name: 'Mandrill API Test',
        required: true,
        status: 'invalid',
        message: `API test failed: ${error}`
      });
    }
  }
}

async function validateWooCommerce(checks: EnvironmentCheck[]) {
  const url = process.env.WOOCOMMERCE_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!url || !consumerKey || !consumerSecret) {
    checks.push({
      category: 'WooCommerce',
      name: 'WooCommerce Configuration',
      required: false,
      status: 'warning',
      message: 'WooCommerce credentials not fully configured'
    });
    return;
  }

  try {
    // Test WooCommerce API
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    const response = await axios.get(`${url}/wp-json/wc/v3/system_status`, {
      headers: {
        'Authorization': `Basic ${auth}`
      },
      timeout: 10000
    });

    if (response.status === 200) {
      checks.push({
        category: 'WooCommerce',
        name: 'WooCommerce API Test',
        required: false,
        status: 'valid',
        message: 'WooCommerce API accessible'
      });

      // Test specific endpoints we use
      const testEndpoints = [
        { path: '/wp-json/wc/v3/products', name: 'Products API' },
        { path: '/wp-json/wc/v3/orders', name: 'Orders API' }
      ];

      for (const endpoint of testEndpoints) {
        try {
          const testResponse = await axios.get(`${url}${endpoint.path}?per_page=1`, {
            headers: { 'Authorization': `Basic ${auth}` },
            timeout: 5000
          });

          checks.push({
            category: 'WooCommerce',
            name: endpoint.name,
            required: false,
            status: 'valid',
            message: 'Endpoint accessible'
          });
        } catch (err) {
          checks.push({
            category: 'WooCommerce',
            name: endpoint.name,
            required: false,
            status: 'warning',
            message: 'Endpoint test failed'
          });
        }
      }

    } else {
      checks.push({
        category: 'WooCommerce',
        name: 'WooCommerce API Test',
        required: false,
        status: 'warning',
        message: `Unexpected response status: ${response.status}`
      });
    }

  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        checks.push({
          category: 'WooCommerce',
          name: 'WooCommerce API Test',
          required: false,
          status: 'invalid',
          message: 'Authentication failed - check credentials'
        });
      } else {
        checks.push({
          category: 'WooCommerce',
          name: 'WooCommerce API Test',
          required: false,
          status: 'warning',
          message: `Connection failed: ${error.message}`
        });
      }
    } else {
      checks.push({
        category: 'WooCommerce',
        name: 'WooCommerce API Test',
        required: false,
        status: 'warning',
        message: `Test failed: ${error}`
      });
    }
  }
}

async function validateDomainSecurity(checks: EnvironmentCheck[]) {
  // Check if we're in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  checks.push({
    category: 'Security',
    name: 'Environment Mode',
    required: true,
    status: 'valid',
    value: process.env.NODE_ENV,
    message: `Running in ${process.env.NODE_ENV} mode`
  });

  // Check HTTPS in production
  const host = process.env.VERCEL_URL || process.env.HOST || 'localhost';
  const protocol = isProduction ? 'https' : 'http';
  
  checks.push({
    category: 'Security',
    name: 'Protocol',
    required: isProduction,
    status: isProduction && !host.includes('https') ? 'warning' : 'valid',
    value: protocol,
    message: isProduction ? 'HTTPS required for production' : 'HTTP OK for development'
  });

  // Domain configuration
  if (isProduction) {
    checks.push({
      category: 'Security',
      name: 'Domain Configuration',
      required: true,
      status: host.includes('wasgeurtje.nl') ? 'valid' : 'warning',
      value: host,
      message: host.includes('wasgeurtje.nl') ? 'Production domain configured' : 'Check domain configuration'
    });
  }
}

async function validateEmailTemplates(checks: EnvironmentCheck[]) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: templates, error } = await supabase
      .from('email_templates')
      .select('template_type, is_active, html_content, merge_variables')
      .eq('is_active', true);

    if (error) {
      checks.push({
        category: 'Email Templates',
        name: 'Template Access',
        required: true,
        status: 'invalid',
        message: `Cannot access templates: ${error.message}`
      });
      return;
    }

    const requiredTemplates = ['day3_notify', 'day5_choice', 'day10_gift_notice'];
    
    for (const requiredType of requiredTemplates) {
      const template = templates.find(t => t.template_type === requiredType);
      
      if (!template) {
        checks.push({
          category: 'Email Templates',
          name: `Template: ${requiredType}`,
          required: true,
          status: 'invalid',
          message: 'Template missing'
        });
      } else {
        // Validate template content
        const hasContent = template.html_content && template.html_content.length > 100;
        const hasMergeVars = template.merge_variables && template.merge_variables.length > 0;
        
        checks.push({
          category: 'Email Templates',
          name: `Template: ${requiredType}`,
          required: true,
          status: hasContent && hasMergeVars ? 'valid' : 'warning',
          message: hasContent && hasMergeVars ? 'Template configured' : 'Template needs content/variables'
        });
      }
    }

  } catch (error) {
    checks.push({
      category: 'Email Templates',
      name: 'Template Validation',
      required: true,
      status: 'invalid',
      message: `Template validation failed: ${error}`
    });
  }
}

function generateRecommendations(checks: EnvironmentCheck[], recommendations: string[]) {
  const invalidChecks = checks.filter(c => c.status === 'invalid');
  const warningChecks = checks.filter(c => c.status === 'warning');

  if (invalidChecks.length > 0) {
    recommendations.push(`🚨 Fix ${invalidChecks.length} critical issues before production deployment`);
  }

  if (warningChecks.length > 0) {
    recommendations.push(`⚠️ Review ${warningChecks.length} warnings for optimal performance`);
  }

  // Specific recommendations
  const mandrillIssues = checks.filter(c => c.category === 'Email' && c.status !== 'valid');
  if (mandrillIssues.length > 0) {
    recommendations.push('📧 Email service needs attention - customers might not receive emails');
  }

  const dbIssues = checks.filter(c => c.category === 'Database' && c.status !== 'valid');
  if (dbIssues.length > 0) {
    recommendations.push('🗄️ Database issues detected - core functionality may be affected');
  }

  const wooCommerceIssues = checks.filter(c => c.category === 'WooCommerce' && c.status === 'invalid');
  if (wooCommerceIssues.length > 0) {
    recommendations.push('🛒 WooCommerce integration issues - order processing may fail');
  }

  if (checks.filter(c => c.status === 'valid').length === checks.length) {
    recommendations.push('✅ All systems operational - ready for production!');
  }
} 
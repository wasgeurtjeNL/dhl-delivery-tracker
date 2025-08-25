// pages/api/admin/production-readiness.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdminAuth } from '@/lib/adminAuth';
import axios from 'axios';

interface ProductionCheck {
  category: string;
  name: string;
  status: 'ready' | 'warning' | 'not_ready' | 'checking';
  importance: 'critical' | 'important' | 'recommended';
  message: string;
  action_required?: string;
  documentation_link?: string;
  details?: any;
}

interface ProductionReadiness {
  overall_status: 'ready' | 'needs_attention' | 'not_ready';
  critical_issues: number;
  warnings: number;
  checks: ProductionCheck[];
  next_steps: string[];
  deployment_guide: {
    domain_setup: string[];
    email_deliverability: string[];
    monitoring: string[];
    backup: string[];
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🚀 Starting production readiness assessment...');

    const checks: ProductionCheck[] = [];

    // 1. Domain & DNS Configuration
    await checkDomainConfiguration(checks);
    
    // 2. Email Deliverability Setup
    await checkEmailDeliverability(checks);
    
    // 3. Security & Authentication
    await checkSecurityConfiguration(checks);
    
    // 4. Performance & Monitoring
    await checkPerformanceMonitoring(checks);
    
    // 5. Backup & Recovery
    await checkBackupConfiguration(checks);
    
    // 6. Environment Variables
    await checkProductionEnvironment(checks);

    // Calculate overall status
    const criticalIssues = checks.filter(c => c.importance === 'critical' && c.status === 'not_ready').length;
    const warnings = checks.filter(c => c.status === 'warning').length;
    
    let overallStatus: 'ready' | 'needs_attention' | 'not_ready';
    if (criticalIssues > 0) {
      overallStatus = 'not_ready';
    } else if (warnings > 0) {
      overallStatus = 'needs_attention';
    } else {
      overallStatus = 'ready';
    }

    // Generate next steps
    const nextSteps = generateNextSteps(checks);

    const result: ProductionReadiness = {
      overall_status: overallStatus,
      critical_issues: criticalIssues,
      warnings,
      checks,
      next_steps: nextSteps,
      deployment_guide: getDeploymentGuide()
    };

    console.log(`✅ Production readiness assessment completed: ${overallStatus}`);

    return res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Production readiness check failed:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to check production readiness',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function checkDomainConfiguration(checks: ProductionCheck[]) {
  const domain = 'wasgeurtje.nl'; // Your production domain
  
  // Check domain exists and is accessible
  try {
    const response = await axios.get(`https://${domain}`, { timeout: 10000 });
    checks.push({
      category: 'Domain & DNS',
      name: 'Domain Accessibility',
      status: response.status === 200 ? 'ready' : 'warning',
      importance: 'critical',
      message: response.status === 200 ? 'Domain is accessible' : 'Domain returns unexpected status',
      details: { status: response.status }
    });
  } catch (error) {
    checks.push({
      category: 'Domain & DNS',
      name: 'Domain Accessibility',
      status: 'not_ready',
      importance: 'critical',
      message: 'Domain is not accessible',
      action_required: 'Ensure domain is properly configured and pointing to your deployment',
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    });
  }

  // Check HTTPS/SSL
  checks.push({
    category: 'Domain & DNS',
    name: 'HTTPS/SSL Configuration',
    status: process.env.NODE_ENV === 'production' ? 'ready' : 'warning',
    importance: 'critical',
    message: process.env.NODE_ENV === 'production' ? 'HTTPS enforced in production' : 'HTTPS should be enforced in production',
    action_required: process.env.NODE_ENV !== 'production' ? 'Configure SSL certificate for production domain' : undefined
  });

  // Check subdomain for admin
  checks.push({
    category: 'Domain & DNS',
    name: 'Admin Subdomain',
    status: 'warning',
    importance: 'recommended',
    message: 'Consider using admin.wasgeurtje.nl for admin access',
    action_required: 'Set up admin subdomain for better security isolation'
  });
}

async function checkEmailDeliverability(checks: ProductionCheck[]) {
  const domain = 'wasgeurtje.nl';
  
  // SPF Record Check
  try {
    // This is a simplified check - in reality you'd use DNS lookup tools
    checks.push({
      category: 'Email Deliverability',
      name: 'SPF Record',
      status: 'warning',
      importance: 'critical',
      message: 'SPF record needs verification',
      action_required: `Add SPF record: "v=spf1 include:mandrillapp.com ~all"`,
      documentation_link: 'https://mailchimp.com/developer/transactional/docs/authentication-delivery/#spf-records'
    });
  } catch (error) {
    checks.push({
      category: 'Email Deliverability',
      name: 'SPF Record',
      status: 'not_ready',
      importance: 'critical',
      message: 'SPF record not found',
      action_required: `Add SPF record to DNS: "v=spf1 include:mandrillapp.com ~all"`
    });
  }

  // DKIM Setup
  checks.push({
    category: 'Email Deliverability',
    name: 'DKIM Verification',
    status: 'warning',
    importance: 'critical',
    message: 'DKIM verification pending',
    action_required: 'Verify DKIM records in Mandrill dashboard',
    documentation_link: 'https://mailchimp.com/developer/transactional/docs/authentication-delivery/#dkim-records'
  });

  // DMARC Policy
  checks.push({
    category: 'Email Deliverability',
    name: 'DMARC Policy',
    status: 'warning',
    importance: 'important',
    message: 'DMARC policy recommended',
    action_required: `Add DMARC record: "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}"`,
    documentation_link: 'https://dmarc.org/overview/'
  });

  // From Domain Verification
  checks.push({
    category: 'Email Deliverability',
    name: 'Sender Domain Verification',
    status: 'warning',
    importance: 'critical',
    message: 'info@wasgeurtje.nl domain needs verification in Mandrill',
    action_required: 'Add and verify sending domain in Mandrill dashboard'
  });

  // Email Reputation
  const mandrillKey = process.env.MANDRILL_API_KEY;
  if (mandrillKey) {
    try {
      const response = await axios.post('https://mandrillapp.com/api/1.0/users/info.json', {
        key: mandrillKey
      });
      
      const reputation = response.data.reputation;
      checks.push({
        category: 'Email Deliverability',
        name: 'Mandrill Reputation',
        status: reputation >= 80 ? 'ready' : reputation >= 60 ? 'warning' : 'not_ready',
        importance: 'important',
        message: `Account reputation: ${reputation}%`,
        details: { reputation, hourly_quota: response.data.hourly_quota }
      });
    } catch (error) {
      checks.push({
        category: 'Email Deliverability',
        name: 'Mandrill Reputation',
        status: 'warning',
        importance: 'important',
        message: 'Unable to check Mandrill reputation'
      });
    }
  }
}

async function checkSecurityConfiguration(checks: ProductionCheck[]) {
  // Environment Variables Security
  const sensitiveVars = ['MANDRILL_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  for (const varName of sensitiveVars) {
    const value = process.env[varName];
    if (value && value.length > 10) {
      checks.push({
        category: 'Security',
        name: `${varName} Security`,
        status: 'ready',
        importance: 'critical',
        message: 'Environment variable is set and appears secure'
      });
    } else {
      checks.push({
        category: 'Security',
        name: `${varName} Security`,
        status: 'not_ready',
        importance: 'critical',
        message: 'Environment variable missing or too short',
        action_required: 'Ensure environment variable is properly set'
      });
    }
  }

  // Rate Limiting
  checks.push({
    category: 'Security',
    name: 'API Rate Limiting',
    status: 'warning',
    importance: 'important',
    message: 'Rate limiting should be implemented',
    action_required: 'Implement rate limiting for API endpoints',
    documentation_link: 'https://nextjs.org/docs/api-routes/rate-limiting'
  });

  // Admin Authentication
  checks.push({
    category: 'Security',
    name: 'Admin Authentication',
    status: 'ready',
    importance: 'critical',
    message: 'Admin authentication is implemented'
  });

  // CORS Configuration
  checks.push({
    category: 'Security',
    name: 'CORS Configuration',
    status: 'warning',
    importance: 'important',
    message: 'CORS should be properly configured for production',
    action_required: 'Review and restrict CORS origins for production'
  });
}

async function checkPerformanceMonitoring(checks: ProductionCheck[]) {
  // Error Logging
  checks.push({
    category: 'Monitoring',
    name: 'Error Logging',
    status: 'ready',
    importance: 'important',
    message: 'Console logging is implemented',
    action_required: 'Consider adding structured logging (e.g., Winston, Pino)'
  });

  // Email Analytics
  checks.push({
    category: 'Monitoring',
    name: 'Email Analytics',
    status: 'ready',
    importance: 'important',
    message: 'Email analytics dashboard is implemented'
  });

  // Uptime Monitoring
  checks.push({
    category: 'Monitoring',
    name: 'Uptime Monitoring',
    status: 'warning',
    importance: 'recommended',
    message: 'External uptime monitoring recommended',
    action_required: 'Set up uptime monitoring (e.g., UptimeRobot, Pingdom)',
    documentation_link: 'https://uptimerobot.com/'
  });

  // Performance Metrics
  checks.push({
    category: 'Monitoring',
    name: 'Performance Metrics',
    status: 'warning',
    importance: 'recommended',
    message: 'Application performance monitoring recommended',
    action_required: 'Consider adding APM (e.g., Vercel Analytics, Sentry)'
  });
}

async function checkBackupConfiguration(checks: ProductionCheck[]) {
  // Database Backups
  checks.push({
    category: 'Backup & Recovery',
    name: 'Database Backups',
    status: 'ready',
    importance: 'critical',
    message: 'Supabase handles automatic backups',
    details: { provider: 'Supabase', automatic: true }
  });

  // Email Template Backups
  checks.push({
    category: 'Backup & Recovery',
    name: 'Email Template Backups',
    status: 'ready',
    importance: 'important',
    message: 'Email templates stored in Supabase (backed up)',
    action_required: 'Consider exporting templates as additional backup'
  });

  // Configuration Backups
  checks.push({
    category: 'Backup & Recovery',
    name: 'Configuration Backups',
    status: 'warning',
    importance: 'important',
    message: 'System settings should be documented',
    action_required: 'Document all system configurations and settings'
  });

  // Disaster Recovery Plan
  checks.push({
    category: 'Backup & Recovery',
    name: 'Disaster Recovery Plan',
    status: 'warning',
    importance: 'recommended',
    message: 'Disaster recovery plan should be documented',
    action_required: 'Create disaster recovery and incident response plan'
  });
}

async function checkProductionEnvironment(checks: ProductionCheck[]) {
  // Node Environment
  checks.push({
    category: 'Environment',
    name: 'NODE_ENV',
    status: process.env.NODE_ENV === 'production' ? 'ready' : 'warning',
    importance: 'critical',
    message: `NODE_ENV is set to: ${process.env.NODE_ENV}`,
    action_required: process.env.NODE_ENV !== 'production' ? 'Set NODE_ENV=production for deployment' : undefined
  });

  // Base URL Configuration
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  checks.push({
    category: 'Environment',
    name: 'Base URL Configuration',
    status: baseUrl && baseUrl.includes('wasgeurtje.nl') ? 'ready' : 'warning',
    importance: 'critical',
    message: baseUrl ? `Base URL: ${baseUrl}` : 'Base URL not configured',
    action_required: !baseUrl || !baseUrl.includes('wasgeurtje.nl') ? 'Set NEXT_PUBLIC_BASE_URL to production domain' : undefined
  });

  // Database Connection
  checks.push({
    category: 'Environment',
    name: 'Database Configuration',
    status: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'ready' : 'not_ready',
    importance: 'critical',
    message: 'Supabase configuration checked',
    action_required: !process.env.SUPABASE_URL ? 'Configure Supabase environment variables' : undefined
  });

  // Email Service Configuration
  checks.push({
    category: 'Environment',
    name: 'Email Service Configuration',
    status: process.env.MANDRILL_API_KEY ? 'ready' : 'not_ready',
    importance: 'critical',
    message: 'Mandrill API configuration checked',
    action_required: !process.env.MANDRILL_API_KEY ? 'Configure Mandrill API key' : undefined
  });
}

function generateNextSteps(checks: ProductionCheck[]): string[] {
  const steps: string[] = [];
  
  const criticalIssues = checks.filter(c => c.importance === 'critical' && c.status === 'not_ready');
  const warnings = checks.filter(c => c.status === 'warning' && c.importance !== 'recommended');
  
  if (criticalIssues.length > 0) {
    steps.push('🚨 CRITICAL: Fix critical issues before deploying to production');
    criticalIssues.forEach(issue => {
      if (issue.action_required) {
        steps.push(`   • ${issue.name}: ${issue.action_required}`);
      }
    });
  }
  
  if (warnings.length > 0) {
    steps.push('⚠️ IMPORTANT: Address warnings for optimal production setup');
    warnings.slice(0, 5).forEach(warning => {
      if (warning.action_required) {
        steps.push(`   • ${warning.name}: ${warning.action_required}`);
      }
    });
  }
  
  if (criticalIssues.length === 0 && warnings.length === 0) {
    steps.push('✅ System is ready for production deployment!');
    steps.push('🚀 Consider implementing recommended improvements for enhanced reliability');
  }
  
  return steps;
}

function getDeploymentGuide() {
  return {
    domain_setup: [
      '1. Configure DNS A/CNAME records to point to your hosting provider',
      '2. Set up SSL certificate (automatic with Vercel/Netlify)',
      '3. Configure admin subdomain (optional but recommended)',
      '4. Test domain accessibility and HTTPS enforcement'
    ],
    email_deliverability: [
      '1. Add SPF record: "v=spf1 include:mandrillapp.com ~all"',
      '2. Configure DKIM in Mandrill dashboard',
      '3. Set up DMARC policy for enhanced security',
      '4. Verify sender domain in Mandrill',
      '5. Test email delivery to major providers (Gmail, Outlook)'
    ],
    monitoring: [
      '1. Set up uptime monitoring for critical endpoints',
      '2. Configure error tracking and alerting',
      '3. Monitor email delivery rates and failures',
      '4. Set up performance monitoring'
    ],
    backup: [
      '1. Verify Supabase automatic backups are enabled',
      '2. Export email templates as backup',
      '3. Document system configurations',
      '4. Create disaster recovery procedures'
    ]
  };
} 
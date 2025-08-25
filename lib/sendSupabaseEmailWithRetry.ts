// lib/sendSupabaseEmailWithRetry.ts
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EmailRecipient {
  email: string;
  name?: string;
}

interface SendEmailOptions {
  to: EmailRecipient;
  templateType: string;
  mergeVars?: Record<string, string>;
  retryOptions?: {
    maxRetries?: number;
    retryDelayMs?: number;
    exponentialBackoff?: boolean;
  };
}

interface EmailResult {
  success: boolean;
  template_type: string;
  recipient: string;
  mandrill_response?: any;
  attempts: number;
  final_error?: string;
  retry_history: {
    attempt: number;
    timestamp: string;
    error?: string;
    success: boolean;
  }[];
}

const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  retryDelayMs: 1000,
  exponentialBackoff: true
};

export async function sendSupabaseEmailWithRetry({
  to,
  templateType,
  mergeVars = {},
  retryOptions = {}
}: SendEmailOptions): Promise<EmailResult> {
  
  const options = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  const result: EmailResult = {
    success: false,
    template_type: templateType,
    recipient: to.email,
    attempts: 0,
    retry_history: []
  };

  console.log(`📧 Starting email send with retry: ${templateType} to ${to.email}`);

  // Get template from Supabase
  let template;
  try {
    const { data: templateData, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_type', templateType)
      .eq('is_active', true)
      .single();

    if (error || !templateData) {
      throw new Error(`Template not found for type: ${templateType}`);
    }
    template = templateData;
  } catch (error) {
    const errorMessage = `Template fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    
    await logEmailError({
      template_type: templateType,
      recipient_email: to.email,
      recipient_name: to.name,
      error_message: errorMessage,
      error_type: 'TEMPLATE_ERROR',
      attempts: 1,
      retry_history: [{ attempt: 1, timestamp: new Date().toISOString(), error: errorMessage, success: false }]
    });

    result.final_error = errorMessage;
    result.attempts = 1;
    result.retry_history.push({ attempt: 1, timestamp: new Date().toISOString(), error: errorMessage, success: false });
    return result;
  }

  // Prepare email content
  let htmlContent = template.html_content;
  let textContent = template.text_content || '';
  let subject = template.subject;

  Object.entries(mergeVars).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    htmlContent = htmlContent.replace(regex, value);
    textContent = textContent.replace(regex, value);
    subject = subject.replace(regex, value);
  });

  // Retry loop
  for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
    result.attempts = attempt;
    
    try {
      console.log(`📧 Attempt ${attempt}/${options.maxRetries + 1}: Sending ${templateType} to ${to.email}`);

      const mandrill_response = await sendViaMandrillAPI({
        to,
        subject,
        htmlContent,
        textContent
      });

      // Success!
      result.success = true;
      result.mandrill_response = mandrill_response;
      result.retry_history.push({
        attempt,
        timestamp: new Date().toISOString(),
        success: true
      });

      // Log successful email
      await logEmailSuccess({
        template_type: templateType,
        recipient_email: to.email,
        recipient_name: to.name,
        subject,
        merge_variables: mergeVars,
        mandrill_response,
        attempts: attempt,
        retry_history: result.retry_history
      });

      console.log(`✅ Email sent successfully on attempt ${attempt}: ${templateType} to ${to.email}`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorType = categorizeError(error);
      
      result.retry_history.push({
        attempt,
        timestamp: new Date().toISOString(),
        error: errorMessage,
        success: false
      });

      console.log(`❌ Attempt ${attempt} failed: ${errorMessage}`);

      // Check if we should retry
      if (attempt <= options.maxRetries && shouldRetry(error, errorType)) {
        const delay = calculateRetryDelay(attempt, options);
        console.log(`⏳ Retrying in ${delay}ms... (attempt ${attempt + 1}/${options.maxRetries + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      } else {
        // Final failure
        result.final_error = errorMessage;
        
        await logEmailError({
          template_type: templateType,
          recipient_email: to.email,
          recipient_name: to.name,
          error_message: errorMessage,
          error_type: errorType,
          attempts: attempt,
          retry_history: result.retry_history
        });

        console.log(`💥 Email failed after ${attempt} attempts: ${templateType} to ${to.email}`);
        return result;
      }
    }
  }

  return result;
}

async function sendViaMandrillAPI({
  to,
  subject,
  htmlContent,
  textContent
}: {
  to: EmailRecipient;
  subject: string;
  htmlContent: string;
  textContent: string;
}) {
  const endpoint = 'https://mandrillapp.com/api/1.0/messages/send.json';

  const payload = {
    key: process.env.MANDRILL_API_KEY,
    message: {
      to: [to],
      from_email: 'info@wasgeurtje.nl',
      from_name: 'Wasgeurtje.nl',
      subject: subject,
      html: htmlContent,
      text: textContent,
      important: true,
      track_opens: true,
      track_clicks: true,
      auto_text: true,
      auto_html: false,
      inline_css: true,
      url_strip_qs: false,
      preserve_recipients: false,
      view_content_link: false
    }
  };

  const { data } = await axios.post(endpoint, payload, {
    timeout: 10000, // 10 second timeout
    headers: {
      'Content-Type': 'application/json'
    }
  });

  // Check Mandrill response for delivery issues
  if (Array.isArray(data) && data.length > 0) {
    const emailResult = data[0];
    if (emailResult.status === 'rejected' || emailResult.status === 'invalid') {
      throw new Error(`Mandrill rejected email: ${emailResult.reject_reason || 'Unknown reason'}`);
    }
  }

  return data;
}

function categorizeError(error: any): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'TIMEOUT_ERROR';
    if (error.response?.status === 401) return 'AUTH_ERROR';
    if (error.response?.status === 500) return 'MANDRILL_SERVER_ERROR';
    if (error.response?.status >= 400 && error.response?.status < 500) return 'CLIENT_ERROR';
    if (error.response?.status >= 500) return 'SERVER_ERROR';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') return 'NETWORK_ERROR';
  }
  
  if (error instanceof Error) {
    if (error.message.includes('rejected')) return 'EMAIL_REJECTED';
    if (error.message.includes('invalid')) return 'INVALID_EMAIL';
    if (error.message.includes('quota')) return 'QUOTA_EXCEEDED';
  }

  return 'UNKNOWN_ERROR';
}

function shouldRetry(error: any, errorType: string): boolean {
  // Don't retry these types of errors
  const nonRetryableErrors = [
    'AUTH_ERROR',
    'INVALID_EMAIL', 
    'EMAIL_REJECTED',
    'CLIENT_ERROR',
    'TEMPLATE_ERROR'
  ];

  if (nonRetryableErrors.includes(errorType)) {
    return false;
  }

  // Retry these errors
  const retryableErrors = [
    'TIMEOUT_ERROR',
    'NETWORK_ERROR',
    'SERVER_ERROR',
    'MANDRILL_SERVER_ERROR',
    'QUOTA_EXCEEDED'
  ];

  return retryableErrors.includes(errorType) || errorType === 'UNKNOWN_ERROR';
}

function calculateRetryDelay(attempt: number, options: typeof DEFAULT_RETRY_OPTIONS): number {
  if (options.exponentialBackoff) {
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    return options.retryDelayMs * Math.pow(2, attempt - 1);
  } else {
    // Fixed delay
    return options.retryDelayMs;
  }
}

async function logEmailSuccess({
  template_type,
  recipient_email,
  recipient_name,
  subject,
  merge_variables,
  mandrill_response,
  attempts,
  retry_history
}: {
  template_type: string;
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  merge_variables: Record<string, string>;
  mandrill_response: any;
  attempts: number;
  retry_history: any[];
}) {
  try {
    await supabase.from('email_logs').insert({
      template_type,
      recipient_email,
      recipient_name,
      subject,
      merge_variables,
      mandrill_response,
      attempts,
      retry_history,
      sent_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log email success:', error);
  }
}

async function logEmailError({
  template_type,
  recipient_email,
  recipient_name,
  error_message,
  error_type,
  attempts,
  retry_history
}: {
  template_type: string;
  recipient_email: string;
  recipient_name?: string;
  error_message: string;
  error_type: string;
  attempts: number;
  retry_history: any[];
}) {
  try {
    await supabase.from('email_logs').insert({
      template_type,
      recipient_email,
      recipient_name,
      error_message,
      error_type,
      attempts,
      retry_history,
      sent_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log email error:', error);
  }
} 
// lib/sendSupabaseEmail.ts
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
  templateType: string; // 'day3_notify', 'day5_choice', 'day10_gift_notice'
  mergeVars?: Record<string, string>;
}

export async function sendSupabaseEmail({
  to,
  templateType,
  mergeVars = {},
}: SendEmailOptions) {
  try {
    // Haal template op uit Supabase
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_type', templateType)
      .eq('is_active', true)
      .single();

    if (error || !template) {
      throw new Error(`Template not found for type: ${templateType}`);
    }

    // Vervang merge variables in HTML content
    let htmlContent = template.html_content;
    let textContent = template.text_content || '';
    let subject = template.subject;

    Object.entries(mergeVars).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      htmlContent = htmlContent.replace(regex, value);
      textContent = textContent.replace(regex, value);
      subject = subject.replace(regex, value);
    });

    // Verstuur via Mandrill
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

    console.log(`📧 Sending email via Supabase template: ${templateType} to ${to.email}`);

    const { data } = await axios.post(endpoint, payload);
    
    // Log de email in de database
    await supabase.from('email_logs').insert({
      template_type: templateType,
      recipient_email: to.email,
      recipient_name: to.name,
      subject: subject,
      merge_variables: mergeVars,
      mandrill_response: data,
      sent_at: new Date().toISOString()
    });

    console.log(`✅ Email sent successfully: ${templateType} to ${to.email}`);
    
    return {
      success: true,
      template_type: templateType,
      recipient: to.email,
      mandrill_response: data
    };

  } catch (error) {
    console.error(`❌ Failed to send email (${templateType}):`, error);
    
    // Log de error
    await supabase.from('email_logs').insert({
      template_type: templateType,
      recipient_email: to.email,
      recipient_name: to.name,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      sent_at: new Date().toISOString()
    });

    throw error;
  }
} 
// pages/api/admin/email-templates.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EmailTemplate {
  id?: number;
  name: string;
  display_name: string;
  subject: string;
  html_content: string;
  text_content?: string;
  template_type: string;
  merge_variables: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    switch (req.method) {
      case 'GET':
        return await getTemplates(req, res);
      case 'POST':
        return await createOrUpdateTemplate(req, res);
      case 'DELETE':
        return await deleteTemplate(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Email templates API error:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to handle email templates request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function getTemplates(req: NextApiRequest, res: NextApiResponse) {
  const { id, type } = req.query;

  try {
    let data, error;

    if (id) {
      const result = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', id)
        .single();
      data = result.data;
      error = result.error;
    } else if (type) {
      const result = await supabase
        .from('email_templates')
        .select('*')
        .eq('template_type', type);
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from('email_templates')
        .select('*')
        .order('template_type');
      data = result.data;
      error = result.error;
    }

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: id ? data : { templates: data },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to fetch email templates:', error);
    throw error;
  }
}

async function createOrUpdateTemplate(req: NextApiRequest, res: NextApiResponse) {
  const { id, ...templateData }: EmailTemplate = req.body;

  try {
    // Validate required fields
    const requiredFields = ['name', 'display_name', 'subject', 'html_content', 'template_type'];
    for (const field of requiredFields) {
      if (!templateData[field as keyof typeof templateData]) {
        return res.status(400).json({ 
          error: `Missing required field: ${field}` 
        });
      }
    }

    let result;
    
    if (id) {
      // Update existing template
      const { data, error } = await supabase
        .from('email_templates')
        .update({
          ...templateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Log the update
      await supabase.from('admin_logs').insert({
        action: 'email_template_updated',
        details: {
          template_id: id,
          template_name: templateData.name,
          changes: templateData
        },
        created_at: new Date().toISOString()
      });

    } else {
      // Create new template
      const { data, error } = await supabase
        .from('email_templates')
        .insert(templateData)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Log the creation
      await supabase.from('admin_logs').insert({
        action: 'email_template_created',
        details: {
          template_id: result.id,
          template_name: templateData.name
        },
        created_at: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
      message: id ? 'Template updated successfully' : 'Template created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to save email template:', error);
    throw error;
  }
}

async function deleteTemplate(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Template ID is required' });
  }

  try {
    // Get template info before deletion for logging
    const { data: template } = await supabase
      .from('email_templates')
      .select('name')
      .eq('id', id)
      .single();

    // Delete the template
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Log the deletion
    await supabase.from('admin_logs').insert({
      action: 'email_template_deleted',
      details: {
        template_id: id,
        template_name: template?.name || 'Unknown'
      },
      created_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'Template deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to delete email template:', error);
    throw error;
  }
} 
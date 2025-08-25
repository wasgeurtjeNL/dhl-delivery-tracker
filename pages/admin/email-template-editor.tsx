// pages/admin/email-template-editor.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

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

export default function EmailTemplateEditor() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html');
  const [previewData, setPreviewData] = useState({
    first_name: 'Jan',
    order_id: '12345',
    tracking_code: '3STBDG0123456789',
    button_url_1: 'https://wasgeurtje.nl/api/tracking/respond?action=new_bottle&order_id=12345',
    button_url_2: 'https://wasgeurtje.nl/api/tracking/respond?action=wait&order_id=12345',
    button_url_3: 'https://wasgeurtje.nl/api/tracking/respond?action=received&order_id=12345'
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/email-templates');
      const data = await response.json();
      
      if (data.success) {
        setTemplates(data.data.templates);
        if (data.data.templates.length > 0 && !selectedTemplate) {
          setSelectedTemplate(data.data.templates[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/admin/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedTemplate)
      });

      const data = await response.json();
      
      if (data.success) {
        await loadTemplates();
        setEditing(false);
        alert('✅ Template opgeslagen!');
      } else {
        alert(`❌ Fout bij opslaan: ${data.message}`);
      }
    } catch (error) {
      alert(`❌ Fout bij opslaan: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const renderPreview = () => {
    if (!selectedTemplate) return null;

    let content = previewMode === 'html' ? selectedTemplate.html_content : selectedTemplate.text_content || '';
    
    // Replace merge variables with preview data
    Object.entries(previewData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
    });

    if (previewMode === 'html') {
      return <div dangerouslySetInnerHTML={{ __html: content }} />;
    } else {
      return <pre className="whitespace-pre-wrap font-mono text-sm">{content}</pre>;
    }
  };

  const getTemplateTypeColor = (type: string) => {
    switch (type) {
      case 'day3_notify': return 'bg-blue-100 text-blue-800';
      case 'day5_choice': return 'bg-yellow-100 text-yellow-800';
      case 'day10_gift_notice': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📧 Email Template Editor</h1>
              <p className="text-gray-600 mt-1">Beheer en bewerk email templates voor het tracking systeem</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/settings')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                ← Terug naar Settings
              </button>
              <button
                onClick={loadTemplates}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '🔄 Laden...' : '🔄 Vernieuwen'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">📋 Templates</h2>
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplate(template);
                    setEditing(false);
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTemplate?.id === template.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{template.display_name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${getTemplateTypeColor(template.template_type)}`}>
                      {template.template_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{template.subject}</p>
                  <div className="text-xs text-gray-500 mt-2">
                    Updated: {new Date(template.updated_at || '').toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Template Editor */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">✏️ Editor</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className={`px-3 py-1 rounded-md text-sm ${
                    editing 
                      ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  {editing ? '👁️ Preview' : '✏️ Edit'}
                </button>
                {editing && (
                  <button
                    onClick={saveTemplate}
                    disabled={saving}
                    className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 text-sm"
                  >
                    {saving ? '💾 Saving...' : '💾 Save'}
                  </button>
                )}
              </div>
            </div>

            {selectedTemplate && editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
                  <input
                    type="text"
                    value={selectedTemplate.display_name}
                    onChange={(e) => setSelectedTemplate({
                      ...selectedTemplate,
                      display_name: e.target.value
                    })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                  <input
                    type="text"
                    value={selectedTemplate.subject}
                    onChange={(e) => setSelectedTemplate({
                      ...selectedTemplate,
                      subject: e.target.value
                    })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">HTML Content</label>
                  <textarea
                    value={selectedTemplate.html_content}
                    onChange={(e) => setSelectedTemplate({
                      ...selectedTemplate,
                      html_content: e.target.value
                    })}
                    rows={12}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Text Content</label>
                  <textarea
                    value={selectedTemplate.text_content || ''}
                    onChange={(e) => setSelectedTemplate({
                      ...selectedTemplate,
                      text_content: e.target.value
                    })}
                    rows={6}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Merge Variables</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.merge_variables.map(variable => (
                      <span 
                        key={variable}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md font-mono"
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {selectedTemplate ? (
                  <div>
                    <div className="text-lg mb-2">👁️</div>
                    <p>Preview mode - Klik "✏️ Edit" om te bewerken</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-lg mb-2">📧</div>
                    <p>Selecteer een template om te bewerken</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">👁️ Preview</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewMode('html')}
                  className={`px-3 py-1 rounded-md text-sm ${
                    previewMode === 'html' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  HTML
                </button>
                <button
                  onClick={() => setPreviewMode('text')}
                  className={`px-3 py-1 rounded-md text-sm ${
                    previewMode === 'text' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Text
                </button>
              </div>
            </div>

            {/* Preview Data Editor */}
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Preview Data:</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="first_name"
                  value={previewData.first_name}
                  onChange={(e) => setPreviewData({...previewData, first_name: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="order_id"
                  value={previewData.order_id}
                  onChange={(e) => setPreviewData({...previewData, order_id: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1"
                />
              </div>
            </div>

            {/* Preview Content */}
            <div className="border border-gray-200 rounded-md p-4 min-h-96 overflow-auto">
              {selectedTemplate ? renderPreview() : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-lg mb-2">📄</div>
                  <p>Selecteer een template voor preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
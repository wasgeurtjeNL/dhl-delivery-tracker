// lib/sendMandrillMail.ts
import axios from 'axios';

interface MandrillRecipient {
  email: string;
  name?: string;
}

export async function sendMandrillEmail({
  to,
  templateName,
  mergeVars = {},
}: {
  to: MandrillRecipient;
  templateName: string;
  mergeVars?: Record<string, string>;
}) {
  const endpoint = 'https://mandrillapp.com/api/1.0/messages/send-template.json';

  const payload = {
    key: process.env.MANDRILL_API_KEY,
    template_name: templateName,
    template_content: [],
    message: {
      to: [to],
      from_email: 'info@wasgeurtje.nl',
      from_name: 'Wasgeurtje.nl',
      subject: 'Status van je bestelling',
      merge: true,
      global_merge_vars: Object.entries(mergeVars).map(([name, content]) => ({
        name,
        content,
      })),
    },
  };

  try {
    const { data } = await axios.post(endpoint, payload);
    return data;
  } catch (err) {
    console.error(`Fout bij versturen Mandrill-email:`, err);
    throw err;
  }
}

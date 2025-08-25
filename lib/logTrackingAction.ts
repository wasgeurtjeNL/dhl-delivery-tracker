// lib/logTrackingAction.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function logTrackingAction({
  tracking_code,
  order_id,
  email,
  action_type,
  details = {},
}: {
  tracking_code: string;
  order_id: string;
  email: string;
  action_type: string;
  details?: Record<string, any>;
}) {
  const { error } = await supabase.from('tracking_logs').insert({
    tracking_code,
    order_id,
    email,
    action_type,
    details,
  });

  if (error) {
    console.error('Fout bij loggen trackingactie:', error);
  } else {
    console.log(`📒 Log toegevoegd: ${action_type} voor ${tracking_code}`);
  }
}

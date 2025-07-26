// pages/api/tracking/respond.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { logTrackingAction } from '@/lib/logTrackingAction';
import { addPointsToCustomer } from '@/lib/addPointsToCustomer';
import { sendReplacementProduct } from '@/lib/sendReplacementProduct';
import { getCustomerIdByEmail } from '@/lib/getCustomerIdByEmail';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Haal systeem instellingen op
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .single();

    if (settingsError) {
      console.error('Failed to fetch system settings:', settingsError);
      return res.status(500).json({ error: 'Kon systeem instellingen niet ophalen' });
    }

    const { action, order_id } = req.query;

    if (!action || !order_id || typeof action !== 'string' || typeof order_id !== 'string') {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    console.log(`🎯 Customer response: ${action} for order ${order_id}`);

    // Haal tracking_match op via order_id
    const { data: match, error } = await supabase
      .from('tracking_matches')
      .select('*')
      .eq('order_id', order_id)
      .single();

    if (!match || error) {
      console.error('Order lookup error:', error);
      return res.status(404).json({ error: 'Order not found' });
    }

  const { tracking_code, email, first_name } = match;

    // Log klantkeuze
    await logTrackingAction({
      tracking_code,
      order_id,
      email,
      action_type: 'customer_choice',
      details: { keuze: action }
    });

    switch (action) {
          case 'new_bottle':
      try {
        await sendReplacementProduct({
          originalOrderId: parseInt(order_id),
          productId: settings.replacement_product_id,
        });
        
        // Deactiveer tracking na vervangingsproduct
        await supabase
          .from('tracking_matches')
          .update({ 
            is_active: false,
            delivery_status: 'vervangen' 
          })
          .eq('tracking_code', tracking_code);
        
        console.log(`✅ Vervangingsproduct (ID: ${settings.replacement_product_id}) besteld voor ${email}`);
        return res.status(200).send(`Bedankt ${first_name}, we sturen je een nieuwe fles toe.`);
      } catch (error) {
        console.error('Error creating replacement order:', error);
        return res.status(500).send(`Sorry ${first_name}, er ging iets mis bij het bestellen. Neem contact met ons op.`);
      }

      case 'received':
        try {
          const customerId = await getCustomerIdByEmail(email);

          if (!customerId) {
            console.warn(`Customer not found for email: ${email}`);
            return res.status(404).send(`We konden je klantprofiel niet vinden om punten toe te kennen.`);
          }

          await addPointsToCustomer({
            customerId,
            points: settings.loyalty_points,
            reason: 'Toch ontvangen - waardering voor je geduld 💛',
          });
          
          // Deactiveer tracking na ontvangstbevestiging
          await supabase
            .from('tracking_matches')
            .update({ 
              is_active: false,
              delivery_status: 'ontvangen_bevestigd' 
            })
            .eq('tracking_code', tracking_code);
          
          console.log(`✅ ${settings.loyalty_points} punten toegekend aan ${email}`);
          return res.status(200).send(`Fijn dat je het pakket hebt ontvangen, ${first_name}. Je hebt ${settings.loyalty_points} punten gekregen!`);
        } catch (error) {
          console.error('Error adding points:', error);
          return res.status(500).send(`Bedankt voor je melding ${first_name}! Er ging iets mis met de punten, maar we lossen dit op.`);
        }

      case 'wait':
        console.log(`✅ Klant kiest voor wachten: ${email}`);
        // Tracking blijft actief bij wachten
        return res.status(200).send(`Geen probleem ${first_name}, we houden het pakket voor je in de gaten.`);

      default:
        console.warn(`Unknown action received: ${action}`);
        return res.status(400).json({ error: 'Ongeldige actie' });
    }

  } catch (error) {
    console.error('Critical error in respond handler:', error);
    return res.status(500).json({ 
      error: 'Er ging iets mis bij het verwerken van je reactie',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

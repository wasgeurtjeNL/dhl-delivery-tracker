// pages/api/replacement/create-order.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { wooCommerceService } from '@/lib/woocommerceService';
import { logTrackingAction } from '@/lib/logTrackingAction';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_REPLACEMENT_PRODUCTS = [
  1410, 1417, 1425, 1423, 1427, 1893, 334999, 273950, 273949, 
  273942, 273946, 273947, 267628, 44876, 335060, 335706
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tracking_code, product_id, customer_notes } = req.body;

  // Validatie
  if (!tracking_code || !product_id) {
    return res.status(400).json({ 
      error: 'Tracking code and product ID are required' 
    });
  }

  if (!ALLOWED_REPLACEMENT_PRODUCTS.includes(parseInt(product_id))) {
    return res.status(400).json({ 
      error: 'Invalid product ID for replacement' 
    });
  }

  try {
    console.log(`🛍️ Creating replacement order: ${tracking_code} -> Product ${product_id}`);

    // 1. Valideer tracking code opnieuw (extra beveiliging)
    const { data: trackingMatch, error: trackingError } = await supabase
      .from('tracking_matches')
      .select('tracking_code, order_id, email, first_name, last_name')
      .eq('tracking_code', tracking_code)
      .single();

    if (trackingError || !trackingMatch) {
      return res.status(404).json({
        error: 'Tracking code not found'
      });
    }

    // 2. Check of replacement al bestaat
    const { data: existingReplacement } = await supabase
      .from('replacement_requests')
      .select('id')
      .eq('tracking_code', tracking_code)
      .single();

    if (existingReplacement) {
      return res.status(409).json({
        error: 'Replacement already exists for this tracking code'
      });
    }

    // 3. Haal originele order details op van WooCommerce
    let originalOrder;
    try {
      originalOrder = await wooCommerceService.getOrderDetails(trackingMatch.order_id);
    } catch (error) {
      console.error('⚠️ Could not fetch original order, using tracking data:', error);
      
      // Fallback: gebruik tracking data als WooCommerce order niet beschikbaar is
      originalOrder = {
        customer: {
          email: trackingMatch.email,
          first_name: trackingMatch.first_name,
          last_name: trackingMatch.last_name,
          billing: {
            email: trackingMatch.email,
            first_name: trackingMatch.first_name,
            last_name: trackingMatch.last_name
          },
          shipping: {
            first_name: trackingMatch.first_name,
            last_name: trackingMatch.last_name
          }
        }
      };
    }

    // 4. Maak replacement order aan in WooCommerce
    const replacementOrderData = {
      customer: originalOrder.customer,
      product_id: parseInt(product_id),
      tracking_code,
      original_order_id: trackingMatch.order_id,
      notes: customer_notes
    };

    const wooOrder = await wooCommerceService.createReplacementOrder(replacementOrderData);

    // 5. Log replacement in onze database
    const { data: replacementRecord, error: replacementError } = await supabase
      .from('replacement_requests')
      .insert({
        tracking_code,
        original_order_id: trackingMatch.order_id,
        replacement_order_id: wooOrder.id.toString(),
        selected_product_id: parseInt(product_id),
        status: 'processing',
        customer_email: trackingMatch.email,
        customer_name: `${trackingMatch.first_name} ${trackingMatch.last_name}`,
        shipping_address: originalOrder.customer.shipping,
        notes: customer_notes,
        woocommerce_response: wooOrder
      })
      .select()
      .single();

    if (replacementError) {
      console.error('❌ Failed to log replacement in database:', replacementError);
      // Probeer toch door te gaan, WooCommerce order is al aangemaakt
    }

    // 6. Log tracking actie
    await logTrackingAction({
      tracking_code,
      order_id: trackingMatch.order_id,
      email: trackingMatch.email,
      action_type: 'replacement_requested',
      details: {
        replacement_order_id: wooOrder.id,
        replacement_order_number: wooOrder.number,
        selected_product_id: parseInt(product_id),
        customer_notes
      }
    });

    console.log(`✅ Replacement order created successfully: ${wooOrder.number}`);

    return res.status(201).json({
      success: true,
      message: 'Replacement order created successfully',
      replacement_order: {
        woocommerce_order_id: wooOrder.id,
        woocommerce_order_number: wooOrder.number,
        status: wooOrder.status,
        tracking_code,
        product_id: parseInt(product_id),
        customer: {
          email: trackingMatch.email,
          name: `${trackingMatch.first_name} ${trackingMatch.last_name}`
        }
      },
      database_record: replacementRecord
    });

  } catch (error) {
    console.error(`❌ Failed to create replacement order for ${tracking_code}:`, error);
    
    return res.status(500).json({ 
      error: 'Failed to create replacement order',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
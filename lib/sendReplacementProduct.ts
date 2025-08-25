import { wcApi } from './woocommerce';

export async function sendReplacementProduct({
  originalOrderId,
  productId,
}: {
  originalOrderId: number;
  productId: number; // ID van het fles-product
}) {
  try {
    // 1. Haal originele order op
    const { data: originalOrder } = await wcApi.get(`orders/${originalOrderId}`);

    // 2. Haal klantgegevens op
    const { customer_id, billing, shipping } = originalOrder;

    // 3. Maak nieuwe order met alleen het product
    const replacementOrder = {
      payment_method: 'bacs',
      payment_method_title: 'Bankoverschrijving',
      set_paid: false,
      customer_id,
      billing,
      shipping,
      line_items: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      meta_data: [
        {
          key: '_compensatie_order',
          value: `Ter vervanging van order #${originalOrderId}`,
        },
      ],
    };

    const { data: newOrder } = await wcApi.post('orders', replacementOrder);
    return newOrder;
  } catch (err) {
    console.error('Fout bij aanmaken compensatie-order:', err);
    throw err;
  }
}

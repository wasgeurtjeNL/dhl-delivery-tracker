import { wcApi } from './woocommerce';

export async function addPointsToCustomer({
  customerId,
  points,
  reason = 'Vertraagde levering',
}: {
  customerId: number;
  points: number;
  reason?: string;
}) {
  try {
    // Voorbeeld: custom endpoint als WP Loyalty REST API dat ondersteunt
    const { data } = await wcApi.post('wployalty/points', {
      customer_id: customerId,
      points,
      reason,
    });

    return data;
  } catch (err) {
    console.error('Fout bij toekennen van punten:', err);
    throw err;
  }
}

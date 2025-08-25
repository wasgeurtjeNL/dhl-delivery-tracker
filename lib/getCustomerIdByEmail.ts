// lib/getCustomerIdByEmail.ts
import { wcApi } from './woocommerce';

export async function getCustomerIdByEmail(email: string): Promise<number | null> {
  try {
    const { data } = await wcApi.get('customers', {
      search: email,
      per_page: 1,
    });

    if (data.length === 0) {
      console.warn(`Geen klant gevonden voor e-mail: ${email}`);
      return null;
    }

    return data[0].id;
  } catch (err) {
    console.error('Fout bij ophalen klant via e-mail:', err);
    return null;
  }
}

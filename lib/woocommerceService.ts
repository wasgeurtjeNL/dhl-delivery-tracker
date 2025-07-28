// lib/woocommerceService.ts
import axios from 'axios';

interface WooCommerceProduct {
  id: number;
  name: string;
  price: string;
  images: { src: string; alt: string }[];
  description: string;
  short_description: string;
  permalink: string;
}

interface CustomerInfo {
  email: string;
  first_name: string;
  last_name: string;
  billing: any;
  shipping: any;
}

interface ReplacementOrderData {
  customer: CustomerInfo;
  product_id: number;
  tracking_code: string;
  original_order_id: string;
  notes?: string;
}

interface WooCommerceOrderResponse {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  date_created: string;
}

// Toegestane replacement product IDs
const ALLOWED_REPLACEMENT_PRODUCTS = [
  1410, 1417, 1425, 1423, 1427, 1893, 334999, 273950, 273949, 
  273942, 273946, 273947, 267628, 44876, 335060, 335706
];

class WooCommerceService {
  private baseURL: string;
  private auth: string;

  constructor() {
    this.baseURL = process.env.WOOCOMMERCE_URL || '';
    const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || '';
    const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || '';
    
    if (!this.baseURL || !consumerKey || !consumerSecret) {
      throw new Error('WooCommerce credentials not configured');
    }

    this.auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  }

  private async makeRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any) {
    try {
      const response = await axios({
        method,
        url: `${this.baseURL}/wp-json/wc/v3/${endpoint}`,
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        data,
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      console.error(`WooCommerce API Error (${endpoint}):`, error);
      if (axios.isAxiosError(error)) {
        throw new Error(`WooCommerce API Error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  async getReplacementProducts(): Promise<WooCommerceProduct[]> {
    console.log('🛒 Fetching replacement products from WooCommerce...');
    
    try {
      // Haal alle toegestane producten op in batches (WooCommerce heeft limits)
      const products: WooCommerceProduct[] = [];
      
      // Split product IDs in chunks van 10 (WooCommerce include parameter limit)
      const chunks = [];
      for (let i = 0; i < ALLOWED_REPLACEMENT_PRODUCTS.length; i += 10) {
        chunks.push(ALLOWED_REPLACEMENT_PRODUCTS.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        const chunkProducts = await this.makeRequest(
          `products?include=${chunk.join(',')}&per_page=10&status=publish`
        );
        products.push(...chunkProducts);
      }

      console.log(`✅ Retrieved ${products.length} replacement products`);
      
      return products.map(product => ({
        id: product.id,
        name: product.name,
        price: product.price,
        images: product.images || [],
        description: product.description || '',
        short_description: product.short_description || '',
        permalink: product.permalink || ''
      }));

    } catch (error) {
      console.error('❌ Failed to fetch replacement products:', error);
      throw new Error('Unable to fetch replacement products');
    }
  }

  async getOrderDetails(orderId: string): Promise<any> {
    console.log(`🔍 Fetching order details for: ${orderId}`);
    
    try {
      const order = await this.makeRequest(`orders/${orderId}`);
      
      return {
        id: order.id,
        number: order.number,
        status: order.status,
        customer: {
          email: order.billing.email,
          first_name: order.billing.first_name,
          last_name: order.billing.last_name,
          billing: order.billing,
          shipping: order.shipping
        },
        line_items: order.line_items,
        total: order.total,
        currency: order.currency,
        date_created: order.date_created
      };

    } catch (error) {
      console.error(`❌ Failed to fetch order ${orderId}:`, error);
      throw new Error(`Unable to fetch order details for ${orderId}`);
    }
  }

  async createReplacementOrder(orderData: ReplacementOrderData): Promise<WooCommerceOrderResponse> {
    console.log(`🛍️ Creating replacement order for product ${orderData.product_id}...`);

    // Valideer product ID
    if (!ALLOWED_REPLACEMENT_PRODUCTS.includes(orderData.product_id)) {
      throw new Error(`Product ID ${orderData.product_id} is not allowed for replacement`);
    }

    try {
      const wooOrderData = {
        status: 'processing', // "in behandeling" status
        customer_id: 0, // Guest order
        billing: {
          first_name: orderData.customer.first_name,
          last_name: orderData.customer.last_name,
          email: orderData.customer.email,
          ...orderData.customer.billing
        },
        shipping: {
          first_name: orderData.customer.first_name,
          last_name: orderData.customer.last_name,
          ...orderData.customer.shipping
        },
        line_items: [
          {
            product_id: orderData.product_id,
            quantity: 1,
            price: '0.00' // Gratis replacement
          }
        ],
        shipping_lines: [
          {
            method_id: 'free_shipping',
            method_title: 'Gratis Verzending (Vervangingsproduct)',
            total: '0.00'
          }
        ],
        fee_lines: [],
        coupon_lines: [],
        meta_data: [
          {
            key: '_replacement_order',
            value: 'true'
          },
          {
            key: '_original_tracking_code',
            value: orderData.tracking_code
          },
          {
            key: '_original_order_id',
            value: orderData.original_order_id
          },
          {
            key: '_replacement_reason',
            value: 'Vertraagde levering - Automatische compensatie'
          }
        ],
        customer_note: orderData.notes || `Vervangingsproduct voor vertraagde levering van tracking code: ${orderData.tracking_code}`
      };

      const order = await this.makeRequest('orders', 'POST', wooOrderData);

      console.log(`✅ Replacement order created: ${order.number} (ID: ${order.id})`);

      return {
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        currency: order.currency,
        date_created: order.date_created
      };

    } catch (error) {
      console.error('❌ Failed to create replacement order:', error);
      throw new Error('Unable to create replacement order in WooCommerce');
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.makeRequest('system_status');
      console.log('✅ WooCommerce connection validated');
      return true;
    } catch (error) {
      console.error('❌ WooCommerce connection failed:', error);
      return false;
    }
  }

  // Helper method om product info op te halen voor een specifiek product
  async getProductById(productId: number): Promise<WooCommerceProduct | null> {
    if (!ALLOWED_REPLACEMENT_PRODUCTS.includes(productId)) {
      throw new Error(`Product ID ${productId} is not allowed for replacement`);
    }

    try {
      const product = await this.makeRequest(`products/${productId}`);
      
      return {
        id: product.id,
        name: product.name,
        price: product.price,
        images: product.images || [],
        description: product.description || '',
        short_description: product.short_description || '',
        permalink: product.permalink || ''
      };
    } catch (error) {
      console.error(`❌ Failed to fetch product ${productId}:`, error);
      return null;
    }
  }
}

export const wooCommerceService = new WooCommerceService();
export type { WooCommerceProduct, CustomerInfo, ReplacementOrderData, WooCommerceOrderResponse };
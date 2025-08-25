# 🚀 Wasgeurtje.nl Tracking System Setup

## 📋 **Benodigde Environment Variabelen**

Maak een `.env.local` bestand in de root van het project met de volgende variabelen:

```bash
# Supabase Configuration (REQUIRED for API endpoints)
SUPABASE_URL=your_supabase_project_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Supabase Configuration (REQUIRED for client-side components like admin/tracking.tsx)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Mandrill Email Service (REQUIRED for sending emails)
MANDRILL_API_KEY=your_mandrill_api_key_here

# WooCommerce API (REQUIRED for customer/order management)
WOOCOMMERCE_URL=https://wasgeurtje.nl
WOOCOMMERCE_CONSUMER_KEY=your_woocommerce_consumer_key_here
WOOCOMMERCE_CONSUMER_SECRET=your_woocommerce_consumer_secret_here

# Optional: Development/Debug Settings
NODE_ENV=development
DEBUG_TRACKING=true
```

## ⚠️ **BELANGRIJK: Dubbele Supabase Config**

Het systeem gebruikt **twee verschillende** Supabase configuraties:

1. **Server-side** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`): Voor API endpoints
2. **Client-side** (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`): Voor React components

**BEIDE zijn vereist!** Als je alleen de server-side hebt geconfigureerd, zal de database test falen.

## 🔧 **Waar je deze waarden vindt:**

### **Supabase**
1. Ga naar je Supabase dashboard
2. **SUPABASE_URL**: Project Settings → API → Project URL
3. **SUPABASE_SERVICE_ROLE_KEY**: Project Settings → API → Service Role Key (secret!)

### **Mandrill**
1. Log in op Mailchimp/Mandrill dashboard
2. **MANDRILL_API_KEY**: Account → Extras → API Keys → Generate New Key

### **WooCommerce**
1. Log in op WordPress admin van wasgeurtje.nl
2. Ga naar WooCommerce → Settings → Advanced → REST API
3. Maak nieuwe API keys aan met Read/Write permissions
4. **WOOCOMMERCE_CONSUMER_KEY**: De gegenereerde Consumer Key
5. **WOOCOMMERCE_CONSUMER_SECRET**: De gegenereerde Consumer Secret

## 🧪 **Testen van de Setup**

Na het configureren van alle environment variabelen:

1. **Test Database Connectie**:
   ```bash
   curl "http://localhost:3000/api/tracking/check"
   ```

2. **Test WooCommerce API**:
   - Controleer of klanten opgehaald kunnen worden
   - Test punten toekenning

3. **Test Mandrill**:
   - Stuur een test e-mail
   - Controleer templates bestaan

## ⚠️ **Belangrijk**

- **Nooit** deze waarden committen naar Git
- Voeg `.env.local` toe aan `.gitignore`
- Gebruik verschillende keys voor development/production
- Service Role Key heeft alle permissions - wees voorzichtig!

## 🎯 **Volgende Stappen na Setup**

1. Test alle API endpoints
2. Configureer Mandrill templates
3. Setup cron job voor dagelijkse uitvoering
4. Monitor logs in Supabase 
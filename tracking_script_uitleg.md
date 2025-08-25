# Wasgeurtje.nl - Proactief Tracking Systeem

## 🎯 **Waarom doen we dit?**

Bij Wasgeurtje.nl vinden we het belangrijk dat klanten hun bestelling op tijd én zonder gedoe ontvangen. Toch komt het soms voor dat een pakketje vertraagd is. Dat kan frustrerend zijn, vooral als je zelf contact moet opnemen om te vragen waar je bestelling blijft.

In plaats van af te wachten tot de klant ons belt of mailt, draaien we het nu om: wij nemen zélf contact op met de klant als er iets mis dreigt te gaan. Dat doen we met behulp van een slim systeem dat automatisch in de gaten houdt of een pakket te lang onderweg is.

## 🏆 **Wat willen we hiermee bereiken?**

- **Klanten geruststellen** voordat ze zich gaan ergeren
- **Laten zien** dat we problemen vóór zijn in plaats van achteraf oplossen  
- **Het vertrouwen** in ons merk versterken
- **Minder klachten** en vragen bij onze klantenservice
- **Trouwe klanten belonen** voor hun geduld

Met andere woorden: we zorgen dat elke klant zich serieus genomen voelt, zelfs als er iets misgaat.

---

## 📊 **Huidige Implementatiestatus**

### ✅ **Wat al werkt:**
- **Database structuur**: Supabase tabellen zijn aangemaakt (`tracking_matches`, `tracking_logs`)
- **Data beschikbaar**: 80 actieve tracking codes klaar voor verwerking
- **API endpoints**: Basis structuur van check en respond endpoints
- **Dependencies**: Alle benodigde packages geïnstalleerd
- **WooCommerce integratie**: API connectie geconfigureerd

### ⚠️ **Wat gedeeltelijk werkt:**
- **DHL Status Check**: Implementatie met Cheerio/Axios (anders dan oorspronkelijk Puppeteer plan)
- **E-mail Templates**: Structuur aanwezig, template namen moeten gesynchroniseerd worden
- **Mandrill Integratie**: Code aanwezig, configuratie nog te testen

### ❌ **Wat nog ontbreekt:**
- **Duplicate Prevention**: `checkIfAlreadyLogged()` functie niet geïmplementeerd
- **Complete Response Handler**: 'Ontvangen' flow onvolledig
- **Environment Setup**: `.env` configuratie ontbreekt
- **Error Handling**: Geen proper try-catch implementatie
- **Cron Job**: Dagelijkse uitvoering nog niet geconfigureerd

---

## 🏗️ **Technische Architectuur**

### **Database Schema (Supabase)**

#### `tracking_matches` tabel
```sql
- id: integer (primary key)
- email: text (klant e-mail)
- first_name: text (voornaam)
- last_name: text (achternaam) 
- tracking_code: text (DHL code)
- order_id: integer (WooCommerce order ID)
- created_at: timestamp (wanneer tracking begonnen)
- batch_id: text (voor groepering)
```

#### `tracking_logs` tabel  
```sql
- id: bigint (primary key)
- tracking_code: text
- order_id: text
- email: text
- action_type: text ('heads_up_sent', 'choice_sent', 'gift_notice_sent', 'customer_choice')
- details: jsonb (extra informatie)
- created_at: timestamp
```

### **API Endpoints**

#### `GET/POST /api/tracking/check`
**Doel**: Controleert alle actieve tracking codes en stuurt e-mails bij vertragingen

**Huidige Implementatie**:
- ✅ Haalt tracking data op uit Supabase
- ✅ Berekent dagen onderweg met `date-fns`
- ✅ DHL status check met Cheerio scraping
- ⚠️ E-mail verzending (template namen checken)
- ❌ Duplicate prevention ontbreekt
- ❌ Error handling ontbreekt

**Logica**:
- **Dag 3**: Vriendelijke heads-up e-mail
- **Dag 5**: Keuze e-mail (nieuwe fles, wachten, of ontvangen)
- **Dag 10**: Automatisch compensatie aanbod

#### `GET /api/tracking/respond`
**Doel**: Verwerkt klantacties uit e-mail knoppen

**Parameters**: `?action=new_bottle&order_id=123`

**Huidige Implementatie**:
- ✅ Basis parameter handling
- ✅ Database lookup via order_id
- ✅ Logging van klantacties
- ✅ 'new_bottle' flow (vervangingsproduct)
- ❌ 'received' flow incompleet (punten toekenning)
- ✅ 'wait' flow (simple response)

---

## 📁 **Bestandsstructuur & Status**

### **API Bestanden**
- `pages/api/tracking/check.ts` - ⚠️ **Gedeeltelijk** (duplicate check ontbreekt)
- `pages/api/tracking/respond.ts` - ⚠️ **Gedeeltelijk** (received flow incompleet)

### **Library Bestanden**
- `lib/scrapeDHL.ts` - ✅ **Werkend** (Cheerio implementatie)
- `lib/sendMandrillMail.ts` - ⚠️ **Te testen** (template namen synchroniseren)
- `lib/logTrackingAction.ts` - ✅ **Werkend**
- `lib/woocommerce.ts` - ✅ **Werkend**
- `lib/addPointsToCustomer.ts` - ⚠️ **Te testen** (WP Loyalty API)
- `lib/sendReplacementProduct.ts` - ✅ **Werkend**
- `lib/getCustomerIdByEmail.ts` - ✅ **Werkend**

### **Admin Interface**
- `components/admin/TrackingLog.tsx` - ✅ **Basis aanwezig**
- `pages/admin/tracking.tsx` - ✅ **Basis aanwezig**

---

## 🚧 **Wat er nog moet gebeuren**

### **Prioriteit 1: Core Functionaliteit Afronden**

1. **Fix Duplicate Prevention** ❗
   ```typescript
   // Toevoegen aan check.ts
   async function checkIfAlreadyLogged(trackingCode: string, actionType: string) {
     const { data } = await supabase
       .from('tracking_logs')
       .select('id')
       .eq('tracking_code', trackingCode)
       .eq('action_type', actionType)
       .limit(1);
     return data && data.length > 0;
   }
   ```

2. **Complete Response Handler** ❗
   ```typescript
   // Fix case 'received' in respond.ts (regel 50-58)
   case 'received':
     const customerId = await getCustomerIdByEmail(email);
     if (customerId) {
       await addPointsToCustomer({
         customerId,
         points: 60,
         reason: 'Toch ontvangen - waardering voor je geduld 💛',
       });
     }
     return res.status(200).send(`Fijn dat je het pakket hebt ontvangen, ${first_name}!`);
   ```

3. **Environment Setup** ❗
   ```bash
   # .env.local bestand maken met:
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   MANDRILL_API_KEY=your_mandrill_key
   WOOCOMMERCE_URL=https://wasgeurtje.nl
   WOOCOMMERCE_CONSUMER_KEY=your_key
   WOOCOMMERCE_CONSUMER_SECRET=your_secret
   ```

### **Prioriteit 2: Productie Gereedheid**

4. **Template Synchronisatie** 📧
   - Controleer Mandrill dashboard template namen
   - Update code: `dag3_notify` → `delay_day_3` (of andersom)

5. **Error Handling** 🛡️
   - Try-catch blokken rond alle API calls
   - Proper error logging naar Supabase

6. **DHL Scraping Testen** 🔍
   - Test met echte tracking codes
   - Implementeer fallback voor failed requests

### **Prioriteit 3: Operationeel Maken**

7. **Cron Job Setup** ⏰
   - Vercel Cron of externe scheduler
   - Dagelijks uitvoeren van `/api/tracking/check`

8. **Monitoring & Admin** 📊
   - Uitbreiden admin dashboard
   - Success/failure metrics
   - Manual trigger mogelijkheid

9. **Testing** 🧪
   - End-to-end test met test tracking codes
   - E-mail template previews
   - WooCommerce API connectivity

---

## 🌟 **Customer Journey Flow**

```
📦 Pakket Verzonden
     ↓
🔍 Dag 3: Check Status
     ↓ (als niet bezorgd)
📧 Heads-up Email: "We houden je pakket in de gaten"
     ↓
🔍 Dag 5: Check Status  
     ↓ (als niet bezorgd)
📧 Keuze Email: "Nieuwe fles | Wachten | Ontvangen?"
     ↓
🎯 Klant Kiest:
     ├── 🆕 Nieuwe Fles → WooCommerce Order + Gratis Verzending
     ├── ⏳ Wachten → Bevestiging + Verder Monitoren  
     └── ✅ Ontvangen → 60 Loyaliteitspunten
     ↓
🔍 Dag 10: Check Status
     ↓ (als niet bezorgd & geen actie)
📧 Gift Notice: "We sturen automatisch een nieuwe fles"
     ↓
🎁 Automatische Compensatie Order
```

---

## 🔧 **Benodigde Configuratie**

### **Mandrill Templates** (te maken/controleren)
- `dag3_notify` - Vriendelijke heads-up
- `dag5_choice` - Keuze e-mail met 3 knoppen  
- `dag10_gift_notice` - Compensatie aankondiging

### **WooCommerce Setup**
- Product ID 1893 = Vervangingsproduct
- WP Loyalty plugin geïnstalleerd
- REST API keys geconfigureerd

### **Supabase Setup**
- Service Role key voor server-side calls
- RLS policies voor admin toegang
- Database backup strategie

---

## 🚀 **Volgende Stappen**

1. **Deze week**: Fix core functionaliteit (duplicate prevention, response handler)
2. **Volgende week**: Test met echte data, template sync
3. **Week 3**: Productie deployment + monitoring setup
4. **Week 4**: Fine-tuning en optimalisaties

**Doel**: Volledig werkend proactief tracking systeem dat klantvertrouwen versterkt door transparante communicatie bij vertragingen.


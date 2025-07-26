# 🕒 Automatische DHL Tracking Refresh - Cron Job Setup

## Overzicht
Dit systeem voert automatisch elk uur een veilige refresh uit van DHL tracking data voor actieve, niet-bezorgde pakketten.

## ⚙️ Environment Variables Setup

Voeg de volgende environment variabele toe aan je `.env.local` (development) of Vercel Environment Variables (production):

```bash
# Cron Job Security - VERPLICHT
CRON_SECRET=your-super-secure-random-string-here

# Bijvoorbeeld:
CRON_SECRET=kj3h4kj5h6k7j8h9k0l1m2n3o4p5q6r7s8t9u0v
```

## 🚀 Deployment Setup

### Vercel (Aanbevolen)
1. De `vercel.json` is al geconfigureerd voor automatische cron jobs
2. Deploy naar Vercel - de cron job wordt automatisch actief
3. Controleer in Vercel dashboard onder "Functions" → "Cron" of de job actief is

### Alternatieve Deployment
Als je niet Vercel gebruikt, kun je externe cron services gebruiken:

1. **GitHub Actions** (gratis):
   ```yaml
   # .github/workflows/cron.yml
   name: DHL Refresh Cron
   on:
     schedule:
       - cron: '0 * * * *'  # Elk uur
   jobs:
     refresh:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger DHL Refresh
           run: |
             curl -X POST https://your-domain.com/api/cron/refresh-trackings \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
               -H "Content-Type: application/json"
   ```

2. **EasyCron** of **Cron-job.org**:
   - URL: `https://your-domain.com/api/cron/refresh-trackings`
   - Method: POST
   - Headers: `Authorization: Bearer YOUR_CRON_SECRET`
   - Schedule: `0 * * * *` (elk uur)

## 🎛️ Admin Controls

### In Admin Settings Panel:

#### **Settings Tab - Cron Job Settings:**
1. **"🕐 Automatische DHL refresh"** - Schakel de cron job in/uit
2. **"Frequentie (minuten)"** - Kies hoe vaak het moet draaien:
   - Elke 5 minuten (voor testing)
   - Elke 15 minuten
   - Elke 30 minuten  
   - Elk uur (aanbevolen)
   - Elke 2-24 uur
3. **"Max trackings per run"** - Aantal trackings per batch (1-100)
4. **"Delay tussen scrapes"** - Pauze tussen requests (1-10 seconden)
5. **"Emergency Stop"** - Stopt alle automatische processen inclusief cron
6. **"🧪 Test Cron Job"** - Test de cron job handmatig

#### **Cron Logs Tab:**
- **Real-time status** met health monitoring
- **Batch geschiedenis** met succesvol/gefaald statistieken
- **Detailleerde logs** per tracking code
- **Performance metrics** en trends

### Flexibele Configuratie:
- **Volledig instelbaar via UI** - Geen code wijzigingen nodig
- **Smart timing** - Vercel draait elke 5 min, maar cron checkt interne timing
- **Rate limiting** - Configureerbaar per run
- **Real-time feedback** - Zie direct resultaten in logs tab

## 📊 Monitoring & Logging

### Console Logs:
```
🕒 Starting automatic tracking refresh cron job...
🔄 Processing 15 trackings...
📦 Processing 1/15: 3SDFC1374664928
✅ 3SDFC1374664928 → bezorgd (2 dagen, 4 uren, 23 minuten)
🎉 Package 3SDFC1374664928 delivered! Marking as inactive.
🏁 Cron job completed: 14 success, 1 errors
```

### Database Logs:
Alle cron activiteit wordt gelogd in `tracking_logs` tabel:
- `action_type`: `'auto_scrape'` voor succesvolle scrapes
- `action_type`: `'auto_scrape_error'` voor fouten
- `details.scraping_method`: `'cron_auto_refresh'`
- `details.cron_batch`: timestamp van de batch

## 🔒 Security Features

1. **Bearer Token Authentication**: Alleen requests met juiste `CRON_SECRET` worden geaccepteerd
2. **Method Restriction**: Alleen POST requests toegestaan
3. **Rate Limiting**: Max 20 trackings per run om overbelasting te voorkomen
4. **Emergency Stop**: Cron job respecteert emergency_stop setting
5. **Auto Disable**: Kan uitgeschakeld worden via admin panel

## 🛠️ Troubleshooting

### Cron Job Start Niet:
```bash
# Test handmatig:
curl -X POST https://your-domain.com/api/cron/test-refresh \
  -H "Content-Type: application/json"
```

### Bekijk Logs:
```bash
# Vercel logs:
vercel logs

# Of check console in admin panel na test
```

### Common Issues:
1. **"Unauthorized"**: CRON_SECRET niet correct ingesteld
2. **"Auto refresh disabled"**: Schakel in via admin panel
3. **"Emergency stop active"**: Schakel emergency stop uit
4. **"No trackings found"**: Alle trackings zijn recent gescraped of bezorgd

## 🎯 Hoe Het Werkt

1. **Elke 5 minuten** wordt `/api/cron/refresh-trackings` aangeroepen door Vercel
2. **Check timing**: Is het tijd voor de volgende run gebaseerd op ingestelde frequentie?
3. **Check settings**: Auto refresh enabled? Emergency stop uit?
4. **Haal trackings op**: Actieve, niet-bezorgde trackings
5. **Smart filtering**: Alleen trackings die langer dan interval geleden gescraped zijn
6. **Process queue**: 1 voor 1 met configureerbare pauzes
7. **Update database**: Nieuwe status, timestamps, duration info
8. **Log activiteit**: Alle acties worden gelogd met batch informatie
9. **Auto deactivate**: Bezorgde pakketten worden gedeactiveerd
10. **Status update**: Cron status en samenvatting opgeslagen voor monitoring

## 📈 Performance Impact

- **Max 20 trackings per uur** = conservatief gebruik
- **3 seconden tussen scrapes** = DHL-vriendelijk
- **Smart filtering** = Geen duplicate scraping
- **Background processing** = Geen impact op user experience

Enjoy de automatische tracking updates! 🚛✨ 
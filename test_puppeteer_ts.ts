// Test script voor Puppeteer DHL tracking
import { scrapeDHLWithPuppeteer } from './lib/scrapeDHLPuppeteer';

async function testPuppeteerTracking(trackingCode: string, expectedStatus: string) {
  console.log(`\n🚀 Testing ${trackingCode} with Puppeteer`);
  console.log(`Verwacht: ${expectedStatus}`);
  
  try {
    const result = await scrapeDHLWithPuppeteer(trackingCode);
    
    console.log('✅ Puppeteer test succesvol');
    console.log('Status gevonden:', result.deliveryStatus);
    console.log('Aflever moment:', result.afleverMoment?.toLocaleString('nl-NL') || 'Geen');
    console.log('Afgegeven moment:', result.afgegevenMoment?.toLocaleString('nl-NL') || 'Geen');
    console.log('Duur:', result.duration || 'Onbekend');
    console.log('Status entries:', result.statusTabel.length);
    
    // Check of de status klopt
    const statusMatches = result.deliveryStatus === (expectedStatus.includes('bezorgd') ? 'bezorgd' : 'onderweg');
    console.log(`Status correct: ${statusMatches ? '✅' : '❌'}`);
    
    if (!statusMatches) {
      console.log(`❌ MISMATCH: Verwacht '${expectedStatus}', kreeg '${result.deliveryStatus}'`);
      console.log('Status tabel (eerste 5):', result.statusTabel.slice(0, 5));
    }
    
    return result;
    
  } catch (error: any) {
    console.error('❌ Puppeteer Test Error:', error.message);
    return null;
  }
}

async function main() {
  console.log('🔍 DHL Puppeteer Tests Starten...');
  
  const result1 = await testPuppeteerTracking('3SDFC1396790620', 'bezorgd in brievenbus');
  const result2 = await testPuppeteerTracking('3SDFC1374664928', 'bezorging ingepland (onderweg)');
  
  console.log('\n📊 Vergelijking resultaten:');
  if (result1 && result2) {
    console.log(`Code 1 status: ${result1.deliveryStatus}`);
    console.log(`Code 2 status: ${result2.deliveryStatus}`);
    
    if (result1.deliveryStatus === result2.deliveryStatus) {
      console.log('⚠️ Beide codes hebben dezelfde status - dit klopt niet!');
    } else {
      console.log('✅ Codes hebben verschillende statussen - dit klopt!');
    }
  }
  
  console.log('\n🏁 Puppeteer tests voltooid');
}

main().catch(console.error); 
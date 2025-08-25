// test-dhl-api.js - Test script voor DHL Official API
const https = require('https');

// Test tracking codes zoals door gebruiker gespecificeerd
const testCases = [
  {
    code: '3SDFC0681190456',
    description: 'Afgeleverd pakket'
  },
  {
    code: '3SDFC1799740226', 
    description: 'Pakket nog niet ontvangen/verwerkt'
  }
];

async function testDHLAPI(trackingCode, description) {
  return new Promise((resolve, reject) => {
    // Gebruik dummy API key voor test (echte key moet in .env.local)
    const apiKey = process.env.DHL_API_KEY || 'dummy-key-for-testing';
    
    const options = {
      hostname: 'api-eu.dhl.com',
      port: 443,
      path: `/track/shipments?trackingNumber=${trackingCode}`,
      method: 'GET',
      headers: {
        'DHL-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'TrackingApp/1.0'
      }
    };

    console.log(`🚀 Testing: ${description}`);
    console.log(`📦 Tracking code: ${trackingCode}`);
    console.log(`🌐 URL: https://${options.hostname}${options.path}`);
    console.log('');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📊 Response Status: ${res.statusCode}`);
        console.log(`📊 Response Headers:`, res.headers['content-type']);
        
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            console.log('✅ SUCCESS - Parsed JSON Response:');
            console.log(JSON.stringify(jsonData, null, 2));
            
            // Analyseer de response structuur
            if (jsonData.shipments && jsonData.shipments.length > 0) {
              const shipment = jsonData.shipments[0];
              console.log('\n📋 ANALYSIS:');
              console.log(`   Status Code: ${shipment.status?.statusCode}`);
              console.log(`   Status Description: ${shipment.status?.description}`);
              console.log(`   Events Count: ${shipment.events?.length || 0}`);
              console.log(`   Current Location: ${shipment.status?.location?.address?.addressLocality || 'N/A'}`);
            }
            
            resolve({ success: true, data: jsonData });
          } catch (error) {
            console.log('❌ JSON Parse Error:', error.message);
            console.log('Raw response:', data);
            resolve({ success: false, error: 'JSON parse error', rawData: data });
          }
        } else {
          console.log(`❌ ERROR - Status: ${res.statusCode}`);
          console.log('Response:', data);
          resolve({ success: false, error: `HTTP ${res.statusCode}`, rawData: data });
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ REQUEST ERROR:', error.message);
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 DHL API Test Suite');
  console.log('='.repeat(50));
  console.log('');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    
    console.log(`\n${i + 1}. ${testCase.description}`);
    console.log('-'.repeat(30));
    
    try {
      const result = await testDHLAPI(testCase.code, testCase.description);
      
      if (result.success) {
        console.log('✅ Test completed successfully');
      } else {
        console.log('⚠️ Test completed with issues');
      }
    } catch (error) {
      console.log('❌ Test failed:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Pause tussen tests
    if (i < testCases.length - 1) {
      console.log('⏳ Waiting 2 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n🏁 All tests completed!');
  console.log('\nNOTE: If you see 401/403 errors, make sure DHL_API_KEY is set in .env.local');
}

// Run de tests
runTests().catch(console.error); 
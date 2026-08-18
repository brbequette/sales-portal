async function verifyInjectedNotificationPipeline() {
  console.log('📡 Dispatching direct test trigger to newly patched serverless route...');
  try {
    const response = await fetch('http://localhost:3000/api/shipping/estimate', {
      method: 'POST',
      headers: { 
        'x-bypass-auth': 'true',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        testMode: true,
        account: 'BEN TEST ACCOUNT',
        zip: '90210',
        city: 'Beverly Hills',
        state: 'CA',
        country: 'US',
        weight: 10.5,
        length: 12,
        width: 12,
        height: 12
      })
    });
    
    console.log(`📊 Route Response: HTTP ${response.status}`);
    const data = await response.json();
    console.log('📬 Response Data:', data);
    console.log('\n👉 Check your brbequette@gmail.com email inbox right now! The notification should arrive instantly.');
  } catch (err: any) {
    console.error('💥 Failed to reach patched backend handler:', err.message);
  }
}

verifyInjectedNotificationPipeline();

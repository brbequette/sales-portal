const handler = require('../netlify/functions/get-rep-stats').handler

async function testPayloadSize() {
  console.log("=== TESTING GET-REP-STATS PAYLOAD SIZE ===")
  const start = Date.now()
  const res = await handler({ httpMethod: 'GET', queryStringParameters: { showHidden: 'true' } }, {})
  const elapsed = Date.now() - start
  console.log(`Execution time: ${elapsed}ms`)
  console.log(`Status Code: ${res.statusCode}`)
  console.log(`Payload Size: ${(res.body.length / 1024 / 1024).toFixed(2)} MB`)
  
  const json = JSON.parse(res.body)
  console.log(`Reps count: ${json.reps?.length}`)
  console.log(`HistoricalVigRates count: ${json.historicalVigRates?.length}`)
  if (json.historicalVigRates?.length > 0) {
    console.log(`Oldest historical month: ${json.historicalVigRates[json.historicalVigRates.length - 1]?.monthKey}`)
    console.log(`Newest historical month: ${json.historicalVigRates[0]?.monthKey}`)
  }
}

testPayloadSize().catch(console.error)

const { handler } = require('../netlify/functions/get-rep-stats')

async function testLiveFetch() {
  console.log("=== EXECUTING GET-REP-STATS DIRECTLY ===")
  const res = await handler({
    path: '/api/get-rep-stats',
    httpMethod: 'GET',
    queryStringParameters: { showHidden: 'true' }
  }, {})

  console.log("Status:", res.statusCode)
  const json = JSON.parse(res.body)
  console.log("Reps length:", json.reps?.length)
  console.log("HistoricalVigRates length:", json.historicalVigRates?.length)

  if (json.historicalVigRates && json.historicalVigRates.length > 0) {
    console.log("\nFirst Historical Month:", json.historicalVigRates[0].monthKey, json.historicalVigRates[0].monthName)
    console.log("Last Historical Month:", json.historicalVigRates[json.historicalVigRates.length - 1].monthKey)
    
    // Check reps in month 0
    const repKeys = Object.keys(json.historicalVigRates[0].reps || {})
    console.log(`\nMonth 0 has data for ${repKeys.length} reps:`, repKeys)
    const sampleRepId = json.reps[0]?.repId
    console.log(`Month 0 data for ${json.reps[0]?.repName} (${sampleRepId}):`, json.historicalVigRates[0].reps?.[sampleRepId])
  } else {
    console.error("❌ historicalVigRates array is EMPTY or missing in response!")
  }
}

testLiveFetch().catch(console.error)

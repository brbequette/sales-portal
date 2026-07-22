const { handler } = require('../netlify/functions/get-rep-stats')

async function testVigLoading() {
  console.log("=== TESTING VIG MANAGEMENT LOADING ===")
  const start = Date.now()
  try {
    const res = await handler({
      path: '/api/get-rep-stats',
      httpMethod: 'GET',
      queryStringParameters: { showHidden: 'true' }
    }, {})

    const elapsed = Date.now() - start
    console.log(`Execution Time: ${elapsed}ms`)
    console.log("Status:", res.statusCode)
    const json = JSON.parse(res.body)
    console.log("Success:", json.success)
    console.log("Reps Count:", json.reps?.length)
    console.log("HistoricalVigRates Count:", json.historicalVigRates?.length)
  } catch (err) {
    console.error("Handler error:", err)
  }
}

testVigLoading().catch(console.error)

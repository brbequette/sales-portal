import { handler } from '../netlify/functions/get-rep-stats'

async function run() {
  console.log("=== RUNNING DIRECT get-rep-stats HANDLER ===")
  const event = {
    path: '/api/get-rep-stats',
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: { showHidden: 'true' },
    body: null,
    isBase64Encoded: false
  }

  const res: any = await handler(event as any, {} as any)
  console.log("Status:", res.statusCode)
  console.log("Body length:", res.body.length)
  const json = JSON.parse(res.body)
  console.log("Reps count:", json.reps?.length)
  console.log("HistoricalVigRates count:", json.historicalVigRates?.length)
  
  if (json.reps && json.reps.length > 0) {
    console.log("\nSample Rep 0:", json.reps[0].repName, "ID:", json.reps[0].repId)
  }

  if (json.historicalVigRates && json.historicalVigRates.length > 0) {
    console.log("\nSample Month 0:", json.historicalVigRates[0].monthKey, json.historicalVigRates[0].monthName)
    const firstRepId = json.reps[0]?.repId
    console.log(`Month 0 reps keys:`, Object.keys(json.historicalVigRates[0].reps || {}))
    console.log(`Month 0 data for rep ${json.reps[0]?.repName} (${firstRepId}):`, json.historicalVigRates[0].reps?.[firstRepId])
  }
}

run().catch(console.error)

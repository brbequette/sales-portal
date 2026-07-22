const fetch = require('node-fetch')

async function testVigRoute() {
  console.log("=== TESTING /api/get-rep-stats ENDPOINT ===")
  const res = await fetch("http://localhost:3000/api/get-rep-stats")
  console.log("Status:", res.status)
  const json = await res.json()
  console.log("Success:", json.success)
  console.log("Reps count:", json.reps?.length)
  console.log("Historical rates count:", json.historicalVigRates?.length)

  if (json.reps && json.reps.length > 0) {
    console.log("Sample Rep:", json.reps[0].repName, json.reps[0].repId)
  }

  if (json.historicalVigRates && json.historicalVigRates.length > 0) {
    console.log("Sample Month:", json.historicalVigRates[0].monthKey, json.historicalVigRates[0].monthName)
  }
}

testVigRoute().catch(console.error)

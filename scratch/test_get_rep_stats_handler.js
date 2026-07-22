const handler = require('../netlify/functions/get-rep-stats').handler

async function testHandler() {
  console.log("=== CALLING get-rep-stats HANDLER ===")
  const res = await handler({ httpMethod: 'GET', queryStringParameters: {} })
  console.log("Status Code:", res.statusCode)
  const json = JSON.parse(res.body)
  console.log("Success:", json.success)
  console.log("Reps:", json.reps ? json.reps.length : 0)
  console.log("Historical Months:", json.historicalVigRates ? json.historicalVigRates.length : 0)

  if (json.historicalVigRates && json.historicalVigRates.length > 0) {
    console.log("\nSample Historical Months:")
    json.historicalVigRates.slice(0, 3).forEach(m => {
      console.log(`Month: ${m.monthKey} (${m.monthName}) | Workdays: ${m.workdays}`)
      Object.entries(m.reps).slice(0, 2).forEach(([repId, data]) => {
        console.log(`  - Rep ${repId}: Metric=${data.metric} | Target=${data.target} | SubtotalGoal=$${data.subtotalGoal} | ProfitGoal=$${data.profitGoal} | Sales (Subtotal Act)=$${data.subtotal} | Profit (Dead Profit Act)=$${data.profit} | VIG Rate=${data.vigRate}`)
      })
    })
  }
}

testHandler().catch(console.error)

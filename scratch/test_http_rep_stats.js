const http = require('http')

async function testHttp() {
  console.log("=== TESTING LIVE HTTP ENDPOINT /api/get-rep-stats?showHidden=true ===")
  const start = Date.now()
  
  fetch("http://localhost:3000/api/get-rep-stats?showHidden=true")
    .then(async res => {
      const elapsed = Date.now() - start
      console.log(`Status: ${res.status}`)
      const text = await res.text()
      console.log(`Response Time: ${elapsed}ms`)
      console.log(`Payload Size: ${(text.length / 1024 / 1024).toFixed(2)} MB`)
      const json = JSON.parse(text)
      console.log(`Reps count: ${json.reps?.length}`)
      console.log(`HistoricalVigRates count: ${json.historicalVigRates?.length}`)
      if (json.historicalVigRates?.length > 0) {
        console.log(`Newest month: ${json.historicalVigRates[0]?.monthKey}`)
        console.log(`Oldest month: ${json.historicalVigRates[json.historicalVigRates.length - 1]?.monthKey}`)
      }
    })
    .catch(err => {
      console.error("Local dev server not running or error:", err.message)
    })
}

testHttp()

const handler = require('../netlify/functions/get-rep-stats').handler

async function testAllRepsVig() {
  console.log("=== TESTING ALL REPS RETURNED IN get-rep-stats ===")
  const res = await handler({ httpMethod: 'GET', queryStringParameters: { showHidden: 'true' } }, {})
  const json = JSON.parse(res.body)
  console.log("Status:", res.statusCode)
  console.log("Reps Count:", json.reps?.length)
  console.log("Reps list:")
  json.reps?.forEach(r => console.log(`  - ${r.repName} (${r.repId})`))
}

testAllRepsVig().catch(console.error)

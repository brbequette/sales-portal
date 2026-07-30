import { handler } from "../netlify/functions/get-commissions"

async function main() {
  const res = await handler({
    queryStringParameters: { year: "all", includeHidden: "true" },
    httpMethod: "GET"
  } as any, {} as any)
  
  if (!res || !res.body) {
    console.log("No response body")
    return
  }

  const json = JSON.parse(res.body)
  if (json.success && json.byRep) {
    const ross = Object.values(json.byRep).find((r: any) => r.repName?.toUpperCase().includes("ROSS HAISLER")) as any
    if (ross) {
      console.log(`Ross Haisler totals in commissions API:`)
      console.log(`  totalSales: ${ross.totalSales}`)
      console.log(`  totalProfit: ${ross.totalProfit}`)
      console.log(`  totalCommission: ${ross.totalCommission}`)
      console.log(`  Invoices count: ${ross.invoices?.length}`)
      if (ross.invoices && ross.invoices.length > 0) {
        console.log(`Sample lightweight invoice:`, ross.invoices[0])
      }
    } else {
      console.log("Ross Haisler not found in byRep")
    }
  } else {
    console.log("Commissions API failed:", json)
  }
}

main().catch(console.error)

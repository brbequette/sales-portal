import { GET } from "../src/app/api/zoho-invoices/route"

async function main() {
  const req = new Request("http://localhost:3000/api/zoho-invoices")
  const res = await GET(req)
  const data = await res.json()
  console.log("Status:", res.status)
  if (data.error) {
    console.error("API Error:", data.error)
    return
  }
  console.log("Total Invoices returned:", data.invoices?.length)
  const rossInvs = data.invoices?.filter((inv: any) => {
    const rep = inv.salesorder_salesperson_name || inv.salesperson_name
    return rep && rep.toUpperCase().includes("ROSS HAISLER")
  })
  console.log("Ross Invoices:", rossInvs?.length)
  if (rossInvs && rossInvs.length > 0) {
    console.log("Sample Ross Invoice:", JSON.stringify(rossInvs[0], null, 2))
  }
}

main().catch(console.error)

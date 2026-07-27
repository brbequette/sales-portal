import { GET } from "../src/app/api/zoho-invoices/route"

async function runTest() {
  const req: any = {
    url: "http://localhost:3000/api/zoho-invoices",
    method: "GET"
  }
  try {
    const res = await GET(req)
    console.log("ZOHO-INVOICES STATUS:", res.status)
    const data = await res.json()
    console.log("INVOICES COUNT:", data.invoices?.length, "ERROR:", data.error)
  } catch (err: any) {
    console.error("ZOHO-INVOICES EXCEPTION:", err)
  }
}

runTest()

import { handler } from "../netlify/functions/zoho-invoices"

async function runTest() {
  const event: any = {
    path: "/api/zoho-invoices",
    httpMethod: "GET",
    headers: {},
    queryStringParameters: {}
  }
  try {
    const res = await handler(event, {} as any)
    console.log("ZOHO-INVOICES FUNC RESULT:", res?.statusCode, res?.body?.slice(0, 150))
  } catch (err: any) {
    console.error("ZOHO-INVOICES FUNC ERROR:", err)
  }
}

runTest()

import { handler } from "../netlify/functions/shipping"

async function runTest() {
  const event: any = {
    path: "/api/shipping",
    httpMethod: "GET",
    headers: {},
    queryStringParameters: {}
  }
  try {
    const res = await handler(event, {} as any)
    console.log("SHIPPING FUNC RESULT:", res?.statusCode, res?.body?.slice(0, 150))
  } catch (err: any) {
    console.error("SHIPPING FUNC ERROR:", err)
  }
}

runTest()

import { handler } from "../netlify/functions/campaign-reengage"

async function runTest() {
  const event: any = {
    path: "/api/campaign-reengage",
    httpMethod: "GET",
    headers: {},
    queryStringParameters: {}
  }
  try {
    const res = await handler(event, {} as any)
    console.log("REENGAGE FUNC RESULT:", res?.statusCode, res?.body)
  } catch (err: any) {
    console.error("REENGAGE FUNC ERROR:", err)
  }
}

runTest()

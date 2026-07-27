import { handler } from "../netlify/functions/get-user"

async function runTest() {
  const event: any = {
    path: "/api/get-user",
    httpMethod: "GET",
    headers: {},
    queryStringParameters: { email: "admin@titandiamond.com" }
  }
  try {
    const res = await handler(event, {} as any)
    console.log("HANDLER RESULT:", res)
  } catch (err: any) {
    console.error("HANDLER ERROR:", err)
  }
}

runTest()

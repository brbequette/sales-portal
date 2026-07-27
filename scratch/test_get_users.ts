import { handler } from "../netlify/functions/get-users"

async function runTest() {
  const event: any = {
    path: "/api/get-users",
    httpMethod: "GET",
    headers: {},
    queryStringParameters: {}
  }
  try {
    const res = await handler(event, {} as any)
    console.log("GET-USERS RESULT:", res?.statusCode, res?.body?.slice(0, 150))
  } catch (err: any) {
    console.error("GET-USERS ERROR:", err)
  }
}

runTest()

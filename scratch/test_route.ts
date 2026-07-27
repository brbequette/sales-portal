import { GET } from "../src/app/api/get-user/route"

async function runRouteTest() {
  const req: any = {
    url: "http://localhost:3000/api/get-user?email=admin@titandiamond.com",
    method: "GET",
    headers: new Map([["accept", "application/json"]])
  }
  try {
    const res = await GET(req)
    console.log("ROUTE STATUS:", res.status)
    const text = await res.text()
    console.log("ROUTE BODY:", text)
  } catch (err: any) {
    console.error("ROUTE ERROR:", err)
  }
}

runRouteTest()

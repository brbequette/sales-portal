import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { contactName: 'asc' }
    })
    return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, vendors }) }
  } catch (err: any) {
    console.error("Admin Vendors Function Error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const storedVendors = await prisma.vendor.findMany({
      where: { status: { notIn: ["inactive", "deleted"], mode: "insensitive" } },
      orderBy: [{ companyName: "asc" }, { contactName: "asc" }],
    })
    const vendors = storedVendors.map(vendor => ({
      contact_id: vendor.zohoId,
      contact_name: vendor.contactName || vendor.companyName || "Unnamed Vendor",
      company_name: vendor.companyName,
      email: vendor.email,
      phone: vendor.phone,
      status: vendor.status,
    }))

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, vendors })
    }

  } catch (err: any) {
    console.error("get-vendors error:", err)
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)

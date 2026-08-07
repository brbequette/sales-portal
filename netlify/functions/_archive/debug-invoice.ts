import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { items: { path: ["invoiceNumber"], equals: "10918" } },
          { items: { path: ["invoiceNumber"], equals: "10913" } },
          { items: { path: ["invoiceNumber"], equals: "10914" } }
        ]
      },
      include: { account: { select: { name: true } } }
    })

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ success: true, invoices })
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

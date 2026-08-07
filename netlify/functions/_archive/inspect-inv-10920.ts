import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }

  try {
    const invNumber = event.queryStringParameters?.num || "10920"

    const allInvoices = await prisma.invoice.findMany()
    const matchingInvoices = allInvoices.filter(inv => {
      const invStr = JSON.stringify(inv)
      return invStr.includes("10920")
    })

    const sampleInvoices = allInvoices.slice(0, 5).map(inv => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      zohoId: inv.zohoId
    }))

    const targetProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { sku: { contains: "UPC24L30S", mode: "insensitive" } },
          { name: { contains: "UPC24L30S", mode: "insensitive" } }
        ]
      }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        matchCount: matchingInvoices.length,
        matchingInvoices,
        sampleInvoices,
        productFound: !!targetProduct,
        productData: targetProduct
      }, null, 2)
    }
  } catch (error: any) {
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message, stack: error.stack })
    }
  }
}

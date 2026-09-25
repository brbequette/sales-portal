import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const search = String(event.queryStringParameters?.search || "").trim()
    const products = await prisma.product.findMany({
      where: search ? {
        OR: [
          { sku: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
          { category: { contains: search, mode: "insensitive" } },
        ],
      } : undefined,
      orderBy: { name: "asc" },
      take: search ? 25 : 2000,
    })
    const skus = products.map(product => product.sku).filter(Boolean)
    const sold = skus.length ? await prisma.lineItem.groupBy({
      by: ['sku'],
      where: { sku: { in: skus } },
      _sum: { quantity: true },
    }) : []
    const soldBySku = new Map(sold.map(row => [String(row.sku || '').trim().toUpperCase(), Number(row._sum.quantity || 0)]))
    const rankedProducts = products.map(product => ({ ...product, salesQuantity: soldBySku.get(product.sku.trim().toUpperCase()) || 0 }))
      .sort((left, right) => Number(right.salesQuantity > 0) - Number(left.salesQuantity > 0) || right.salesQuantity - left.salesQuantity || left.name.localeCompare(right.name))

    const cors = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, products: rankedProducts })
    }

  } catch (error: any) {
    console.error("Get Products Error:", error)
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)

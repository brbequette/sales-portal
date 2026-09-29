import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { Prisma } from "@prisma/client"

export async function GET(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limitParam = searchParams.get("limit") || "25"
    const isAll = limitParam === "all"
    const limit = isAll ? 1000 : Math.max(1, parseInt(limitParam, 10))
    const tab = searchParams.get("tab") || "pos"
    const q = (searchParams.get("q") || "").trim()
    const dateFilter = searchParams.get("dateFilter") || "all"
    const sort = searchParams.get("sort") || "date-desc"

    const skip = isAll ? 0 : (page - 1) * limit

    if (tab === "pos") {
      // Build Prisma WHERE condition for POs
      const where: Prisma.PurchaseOrderWhereInput = {
        invoiceId: null,
        isInventoryOrder: false,
      }

      if (dateFilter === "dated") {
        where.date = { not: null }
      } else if (dateFilter === "missing") {
        where.date = null
      }

      if (q) {
        // Query Customer Accounts by address or name to find associated PO shipTo / shippingAddress values
        const matchingAccounts = await prisma.account.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { shippingStreet: { contains: q, mode: "insensitive" } },
              { shippingCity: { contains: q, mode: "insensitive" } },
              { shippingState: { contains: q, mode: "insensitive" } },
              { shippingZip: { contains: q, mode: "insensitive" } },
              { billingStreet: { contains: q, mode: "insensitive" } },
              { billingCity: { contains: q, mode: "insensitive" } },
              { billingState: { contains: q, mode: "insensitive" } },
              { billingZip: { contains: q, mode: "insensitive" } }
            ]
          },
          select: {
            name: true,
            shippingStreet: true,
            shippingCity: true,
            billingStreet: true
          },
          take: 20
        })

        const extraCustomerOrConditions: Prisma.PurchaseOrderWhereInput[] = []
        for (const acc of matchingAccounts) {
          if (acc.name) {
            extraCustomerOrConditions.push({ shipToName: { contains: acc.name, mode: "insensitive" } })
            extraCustomerOrConditions.push({ shippingAddress: { contains: acc.name, mode: "insensitive" } })
          }
          if (acc.shippingStreet && acc.shippingStreet.length > 3) {
            extraCustomerOrConditions.push({ shippingAddress: { contains: acc.shippingStreet, mode: "insensitive" } })
          }
          if (acc.billingStreet && acc.billingStreet.length > 3) {
            extraCustomerOrConditions.push({ shippingAddress: { contains: acc.billingStreet, mode: "insensitive" } })
          }
        }

        where.OR = [
          { poNumber: { contains: q, mode: "insensitive" } },
          { zohoId: { contains: q, mode: "insensitive" } },
          { vendorName: { contains: q, mode: "insensitive" } },
          { shipToName: { contains: q, mode: "insensitive" } },
          { shippingAddress: { contains: q, mode: "insensitive" } },
          { referenceNumber: { contains: q, mode: "insensitive" } },
          { salesOrderNumber: { contains: q, mode: "insensitive" } },
          ...extraCustomerOrConditions
        ]
      }

      // Build orderBy
      let orderBy: Prisma.PurchaseOrderOrderByWithRelationInput = { date: "desc" }
      if (sort === "date-asc") orderBy = { date: "asc" }
      else if (sort === "amount-desc") orderBy = { total: "desc" }
      else if (sort === "amount-asc") orderBy = { total: "asc" }
      else if (sort === "name-asc") orderBy = { vendorName: "asc" }

      const [totalCount, purchaseOrders, totalUnassociatedPOs, totalUnassociatedPayments] = await Promise.all([
        prisma.purchaseOrder.count({ where }),
        prisma.purchaseOrder.findMany({
          where,
          orderBy,
          skip: isAll ? undefined : skip,
          take: isAll ? undefined : limit,
        }),
        prisma.purchaseOrder.count({ where: { invoiceId: null, isInventoryOrder: false } }),
        prisma.payment.count({ where: { invoiceId: null } })
      ])

      const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalCount / limit))

      return NextResponse.json({
        success: true,
        purchaseOrders,
        payments: [],
        totalCount,
        poCount: totalUnassociatedPOs,
        paymentCount: totalUnassociatedPayments,
        page,
        limit: isAll ? totalCount : limit,
        totalPages
      })
    } else {
      // Build Prisma WHERE condition for Payments
      const where: Prisma.PaymentWhereInput = {
        invoiceId: null,
      }

      if (dateFilter === "dated") {
        where.date = { not: null }
      } else if (dateFilter === "missing") {
        where.date = null
      }

      if (q) {
        where.OR = [
          { zohoId: { contains: q, mode: "insensitive" } },
          { referenceNumber: { contains: q, mode: "insensitive" } },
          { mode: { contains: q, mode: "insensitive" } },
          { invoiceNumber: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ]
      }

      let orderBy: Prisma.PaymentOrderByWithRelationInput = { date: "desc" }
      if (sort === "date-asc") orderBy = { date: "asc" }
      else if (sort === "amount-desc") orderBy = { amount: "desc" }
      else if (sort === "amount-asc") orderBy = { amount: "asc" }
      else if (sort === "name-asc") orderBy = { referenceNumber: "asc" }

      const [totalCount, payments, totalUnassociatedPOs, totalUnassociatedPayments] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({
          where,
          orderBy,
          skip: isAll ? undefined : skip,
          take: isAll ? undefined : limit,
        }),
        prisma.purchaseOrder.count({ where: { invoiceId: null, isInventoryOrder: false } }),
        prisma.payment.count({ where: { invoiceId: null } })
      ])

      const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalCount / limit))

      return NextResponse.json({
        success: true,
        purchaseOrders: [],
        payments,
        totalCount,
        poCount: totalUnassociatedPOs,
        paymentCount: totalUnassociatedPayments,
        page,
        limit: isAll ? totalCount : limit,
        totalPages
      })
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}


import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from "next/server";
import { checkAccountOwnership } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const zohoId = url.searchParams.get("zohoId");
    const type = url.searchParams.get("type"); // Invoice, SalesOrder, Quote

    if (!zohoId) {
      return NextResponse.json({ success: false, message: "Missing zohoId" }, { status: 400 });
    }

    let localDocId: string | null = null;
    let accountId: string | null = null;

    if (type === "Invoice") {
      const doc = await prisma.invoice.findFirst({ where: { OR: [{ id: zohoId }, { zohoId: zohoId }] }, select: { id: true, accountId: true } });
      if (doc) { localDocId = doc.id; accountId = doc.accountId }
    } else if (type === "SalesOrder") {
      const doc = await prisma.salesOrder.findFirst({ where: { OR: [{ id: zohoId }, { zohoId: zohoId }] }, select: { id: true, accountId: true } });
      if (doc) { localDocId = doc.id; accountId = doc.accountId }
    } else if (type === "Quote") {
      const doc = await prisma.quote.findFirst({ where: { OR: [{ id: zohoId }, { zohoId: zohoId }] }, select: { id: true, accountId: true } });
      if (doc) { localDocId = doc.id; accountId = doc.accountId }
    }

    if (!localDocId) {
       return NextResponse.json({ success: true, tasks: [] });
    }

    const ownership = await checkAccountOwnership(accountId || "")
    if (!ownership.authorized) return ownership.errorResponse || NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { invoiceId: { in: [localDocId, zohoId].filter(Boolean) as string[] } },
          { salesOrderId: { in: [localDocId, zohoId].filter(Boolean) as string[] } },
          { quoteId: { in: [localDocId, zohoId].filter(Boolean) as string[] } },
          { estimateId: { in: [localDocId, zohoId].filter(Boolean) as string[] } },
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ success: true, tasks });

  } catch (error: any) {
    console.error("Error fetching document tasks:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

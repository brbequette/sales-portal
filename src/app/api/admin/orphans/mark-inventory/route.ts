import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing PO ID" }, { status: 400 })
    }

    await prisma.purchaseOrder.update({
      where: { zohoId: id },
      data: {
        isInventoryOrder: true
      }
    })

    return NextResponse.json({ success: true, message: "Purchase Order marked as Inventory Order successfully." })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

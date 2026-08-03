import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "50", 10)

    const totalCount = await prisma.lead.count({
      where: { matchStatus: { in: ["QUESTIONABLE", "DISCREPANCY"] } }
    })

    const questionableLeads = await prisma.lead.findMany({
      where: { matchStatus: { in: ["QUESTIONABLE", "DISCREPANCY"] } },
      include: {
        owner: { select: { id: true, name: true, email: true } }
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    })

    return NextResponse.json({
      success: true,
      totalCount,
      page,
      limit,
      leads: questionableLeads
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, leadIds, targetCompanyName } = await req.json()
    if (!action || !leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "action and leadIds are required" }, { status: 400 })
    }

    if (action === "confirm_merge") {
      const unifiedCompany = targetCompanyName || "Merged Company"
      const companyGroupId = unifiedCompany.toUpperCase().replace(/[^A-Z0-9]/g, "")

      await prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: {
          company: unifiedCompany,
          companyGroupId,
          matchStatus: "CONFIRMED",
          matchReason: "Resolved and merged by Admin"
        }
      })

      return NextResponse.json({
        success: true,
        message: `Successfully merged ${leadIds.length} leads under '${unifiedCompany}' and confirmed.`
      })
    }

    if (action === "separate_leads") {
      for (const id of leadIds) {
        const lead = await prisma.lead.findUnique({ where: { id } })
        if (lead) {
          const companyGroupId = lead.company.toUpperCase().replace(/[^A-Z0-9]/g, "")
          await prisma.lead.update({
            where: { id },
            data: {
              companyGroupId,
              matchStatus: "CONFIRMED",
              matchReason: "Separated as independent company by Admin"
            }
          })
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully separated ${leadIds.length} leads into independent company groups and confirmed.`
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

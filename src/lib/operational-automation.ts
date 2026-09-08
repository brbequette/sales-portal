import { prisma } from "@/lib/prisma"

type Candidate = { key: string; subject: string; description: string; dueDate: Date; accountId?: string | null; salesOrderId?: string | null; priority: string; type: string }

export async function generateOperationalTasks(options: { apply?: boolean } = {}) {
  const now = new Date()
  const defaultOwner = await prisma.user.findFirst({ where: { role: { contains: "admin", mode: "insensitive" } }, orderBy: { createdAt: "asc" }, select: { id: true } }) || await prisma.user.findFirst({ select: { id: true } })
  if (!defaultOwner) return { candidates: 0, created: 0, skipped: 0 }
  const [orders, packages, failedActions, linkedPackages] = await Promise.all([
    prisma.salesOrder.findMany({ where: { orderDate: { lte: new Date(now.getTime() - 2 * 86_400_000) }, status: { notIn: ["Invoiced", "invoiced", "billed", "Void", "void", "Cancelled", "cancelled"] } }, select: { id: true, zohoId: true, accountId: true }, take: 1000 }),
    prisma.package.findMany({ where: { createdAt: { lte: new Date(now.getTime() - 86_400_000) }, trackingNumber: null, status: { notIn: ["delivered", "Delivered", "cancelled", "Cancelled"] } }, take: 1000 }),
    prisma.operationalAction.findMany({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } }, orderBy: { updatedAt: "asc" }, take: 500 }),
    prisma.package.findMany({ where: { salesOrderId: { not: null } }, select: { salesOrderId: true } }),
  ])
  const packagedIds = new Set(linkedPackages.map(row => row.salesOrderId))
  const candidates: Candidate[] = []
  for (const order of orders) if (order.zohoId && !packagedIds.has(order.zohoId)) candidates.push({ key: `AUTO:ORDER:PACKAGE:${order.id}`, subject: "Prepare package for open sales order", description: "Automatically generated: this sales order has remained open without a linked package for more than two days.", dueDate: now, accountId: order.accountId, salesOrderId: order.zohoId, priority: "High", type: "Fulfillment" })
  for (const pkg of packages) candidates.push({ key: `AUTO:PACKAGE:TRACKING:${pkg.id}`, subject: `Add tracking to package ${pkg.packageNumber || pkg.zohoId}`, description: "Automatically generated: package has no tracking after one day.", dueDate: now, salesOrderId: pkg.salesOrderId, priority: "High", type: "Fulfillment" })
  for (const action of failedActions) candidates.push({ key: `AUTO:ACTION:${action.id}`, subject: `Resolve failed ${action.actionType}`, description: `Automatically generated integration exception for ${action.entityNumber || action.entityId}. ${action.errorMessage || "Review and safely retry."}`, dueDate: action.nextAttemptAt || now, accountId: action.accountId, priority: action.status === "DEAD_LETTER" ? "High" : "Normal", type: "Integration" })
  if (!options.apply) return { candidates: candidates.length, preview: candidates.slice(0, 100) }
  let created = 0, skipped = 0
  for (const candidate of candidates) {
    if (await prisma.task.findUnique({ where: { zohoId: candidate.key } })) { skipped++; continue }
    await prisma.task.create({ data: { zohoId: candidate.key, subject: candidate.subject, description: candidate.description, dueDate: candidate.dueDate, ownerId: defaultOwner.id, accountId: candidate.accountId, salesOrderId: candidate.salesOrderId, priority: candidate.priority, type: candidate.type } })
    created++
  }
  return { candidates: candidates.length, created, skipped }
}

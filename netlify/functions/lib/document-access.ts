import { prisma } from "./prisma"
import { isAdminRole } from "../../../src/lib/roles"

type SessionIdentity = {
  userId?: string
  dbId?: string
  role?: string
}

type DocumentKind = "invoice" | "quote" | "salesOrder"

type DocumentReference = {
  id?: string
  number?: string
}

export async function authorizeDocumentAccess(
  sessionUser: SessionIdentity,
  kind: DocumentKind,
  reference: DocumentReference,
) {
  const administrator = isAdminRole(sessionUser.role)
  const actorId = sessionUser.dbId || sessionUser.userId

  if (administrator) return { authorized: true, administrator, actorId }
  if (!actorId) return { authorized: false, administrator, actorId }

  const commonSelect = { account: { select: { ownerId: true } } } as const
  let record: { account: { ownerId: string } } | null = null

  if (kind === "invoice") {
    record = await prisma.invoice.findFirst({
      where: {
        OR: [
          ...(reference.id ? [{ id: reference.id }, { zohoId: reference.id }] : []),
          ...(reference.number ? [{ items: { path: ["invoiceNumber"], equals: reference.number } }] : []),
        ],
      },
      select: commonSelect,
    })
  } else if (kind === "quote") {
    record = await prisma.quote.findFirst({
      where: {
        OR: [
          ...(reference.id ? [{ id: reference.id }, { zohoId: reference.id }] : []),
          ...(reference.number ? [{ items: { path: ["estimateNumber"], equals: reference.number } }] : []),
        ],
      },
      select: commonSelect,
    })
  } else {
    record = await prisma.salesOrder.findFirst({
      where: {
        OR: [
          ...(reference.id ? [{ id: reference.id }, { zohoId: reference.id }] : []),
          ...(reference.number ? [{ items: { path: ["salesOrderNumber"], equals: reference.number } }] : []),
        ],
      },
      select: commonSelect,
    })
  }

  return {
    authorized: record?.account.ownerId === actorId,
    administrator,
    actorId,
  }
}

export const authorizeCostProcessing = authorizeDocumentAccess

export function hasPrivilegedCostOptions(body: Record<string, unknown>) {
  return body.vigRate !== undefined
    || body.commissionPercent !== undefined
    || body.noVigOverrides !== undefined
    || body.skipLoopGuard === true
}

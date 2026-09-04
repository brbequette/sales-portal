import { prisma } from './prisma'
import { Prisma } from '@prisma/client'

export type ReviewStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED'
type ReviewClient = Pick<typeof prisma, 'financialReview'>
type JsonInput = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput

export function normalizeReviewMetadata(value: unknown): JsonInput | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  const seen = new WeakSet<object>()
  const visit = (item: unknown): Prisma.InputJsonValue | null => {
    if (item === null) return null
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      if (typeof item === 'number' && !Number.isFinite(item)) throw new TypeError('Metadata contains a non-finite number')
      return item
    }
    if (Array.isArray(item)) {
      if (seen.has(item)) throw new TypeError('Metadata contains a circular reference')
      seen.add(item)
      const result = item.map(visit)
      seen.delete(item)
      return result
    }
    if (typeof item === 'object') {
      if (Object.getPrototypeOf(item) !== Object.prototype) throw new TypeError('Metadata contains an unsupported object type')
      if (seen.has(item)) throw new TypeError('Metadata contains a circular reference')
      seen.add(item)
      const result: { [key: string]: Prisma.InputJsonValue | null } = {}
      for (const [key, child] of Object.entries(item)) result[key] = visit(child)
      seen.delete(item)
      return result
    }
    throw new TypeError('Metadata contains an unsupported value')
  }
  const result = visit(value)
  return result === null ? Prisma.JsonNull : result
}

export async function upsertFinancialReview(input: {
  documentType: string
  documentRef: string
  invoiceId?: string
  reasonCode: string
  sourceType?: string
  sourceRecord?: string
  metadata?: JsonInput
  db?: ReviewClient
}) {
  const client = input.db || prisma
  const { db: _db, ...data } = input
  const metadata = normalizeReviewMetadata(data.metadata)
  return client.financialReview.upsert({
    where: { documentType_documentRef_reasonCode: { documentType: data.documentType, documentRef: data.documentRef, reasonCode: data.reasonCode } },
    create: { documentType: data.documentType, documentRef: data.documentRef, invoiceId: data.invoiceId, reasonCode: data.reasonCode, sourceType: data.sourceType, sourceRecord: data.sourceRecord, ...(metadata === undefined ? {} : { metadata }), status: 'OPEN' },
    update: { sourceType: data.sourceType, sourceRecord: data.sourceRecord, ...(metadata === undefined ? {} : { metadata }) },
  })
}

export async function resolveFinancialReview(input: { documentType: string; documentRef: string; reasonCode: string; resolverId?: string; resolutionNotes?: string; db?: ReviewClient }) {
  const client = input.db || prisma
  return client.financialReview.updateMany({
    where: { documentType: input.documentType, documentRef: input.documentRef, reasonCode: input.reasonCode, status: 'OPEN' },
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolverId: input.resolverId, resolutionNotes: input.resolutionNotes },
  })
}

export async function hasOpenFinancialReview(documentType: string, documentRef: string, db: ReviewClient = prisma) {
  const count = await db.financialReview.count({ where: { documentType, documentRef, status: 'OPEN' } })
  return count > 0
}

export async function openReviewConflict(documentType: string, documentRef: string) {
  const reviews = await prisma.financialReview.findMany({ where: { documentType, documentRef, status: 'OPEN' }, select: { reasonCode: true } })
  return { documentType, documentRef, reasonCodes: reviews.map(r => r.reasonCode) }
}

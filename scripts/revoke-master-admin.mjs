import { PrismaClient } from '@prisma/client'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const prisma = new PrismaClient()
const rl = createInterface({ input, output })

try {
  const loginIdentifier = (await rl.question('Master administrator login to revoke: ')).trim().toLowerCase()
  if (!loginIdentifier) throw new Error('INVALID_REVOCATION_INPUT')
  const credential = await prisma.localMasterCredential.findUnique({
    where: { loginIdentifier }, select: { id: true, userId: true, active: true },
  })
  if (!credential) throw new Error('MASTER_CREDENTIAL_NOT_FOUND')
  if (!credential.active) throw new Error('MASTER_CREDENTIAL_ALREADY_REVOKED')
  await prisma.$transaction(async tx => {
    await tx.localMasterCredential.update({ where: { id: credential.id }, data: {
      active: false, revokedAt: new Date(), passwordVersion: { increment: 1 },
    } })
    await tx.authAuditEvent.create({ data: {
      eventType: 'LOCAL_MASTER_CREDENTIAL_REVOKED', actorUserId: credential.userId,
      reasonCode: 'EXPLICIT_OPERATOR_COMMAND', entityType: 'LOCAL_MASTER_CREDENTIAL',
      changedFields: { active: false, passwordVersionIncremented: true },
    } })
  })
  console.log('MASTER_ADMIN_REVOCATION=PASS')
} catch (error) {
  const category = error instanceof Error ? error.message : 'REVOCATION_FAILED'
  const safe = new Set(['INVALID_REVOCATION_INPUT', 'MASTER_CREDENTIAL_NOT_FOUND', 'MASTER_CREDENTIAL_ALREADY_REVOKED'])
  console.error(safe.has(category) ? category : 'REVOCATION_FAILED')
  process.exitCode = 1
} finally {
  rl.close()
  await prisma.$disconnect().catch(() => undefined)
}

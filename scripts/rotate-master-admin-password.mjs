import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const prisma = new PrismaClient()
const rl = createInterface({ input, output })
const strong = value => typeof value === 'string' && value.length >= 14 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)

try {
  const email = (await rl.question('Master administrator email: ')).trim().toLowerCase()
  const password = await rl.question('New password: ', { hideEchoBack: true })
  const confirmation = await rl.question('Confirm new password: ', { hideEchoBack: true })
  if (!strong(password) || password !== confirmation) throw new Error('INVALID_ROTATION_INPUT')
  const credential = await prisma.localMasterCredential.findUnique({ where: { loginIdentifier: email }, select: { id: true, userId: true, active: true, revokedAt: true } })
  if (!credential) throw new Error('MASTER_CREDENTIAL_NOT_FOUND')
  if (!credential.active || credential.revokedAt) throw new Error('MASTER_CREDENTIAL_REVOKED')
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.$transaction(async tx => {
    await tx.localMasterCredential.update({ where: { id: credential.id }, data: {
      passwordHash, mustRotatePassword: false, failedLoginCount: 0, lockedUntil: null,
      passwordVersion: { increment: 1 }, rotatedAt: new Date(),
    } })
    await tx.authAuditEvent.create({ data: {
      eventType: 'LOCAL_MASTER_CREDENTIAL_ROTATED', actorUserId: credential.userId,
      reasonCode: 'EXPLICIT_OPERATOR_COMMAND', entityType: 'LOCAL_MASTER_CREDENTIAL',
      changedFields: { passwordVersionIncremented: true, mustRotatePassword: false },
    } })
  })
  console.log('MASTER_ADMIN_ROTATION=PASS')
} finally {
  rl.close()
  await prisma.$disconnect()
}

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
  const user = await prisma.user.findFirst({ where: { email, role: 'MASTER_ADMIN', authType: 'LOCAL' }, select: { id: true } })
  if (!user) throw new Error('MASTER_ACCOUNT_NOT_FOUND')
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 12), mustRotatePassword: false, failedLoginCount: 0, lockedUntil: null } })
  await prisma.authAuditEvent.create({ data: { eventType: 'MASTER_PASSWORD_ROTATED', actorUserId: user.id } })
  console.log('MASTER_ADMIN_ROTATION=PASS')
} finally {
  rl.close()
  await prisma.$disconnect()
}

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const prisma = new PrismaClient()
const rl = createInterface({ input, output })
const strong = value => typeof value === 'string' && value.length >= 14 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)

try {
  const email = (await rl.question('Master administrator email: ')).trim().toLowerCase()
  const username = (await rl.question('Master administrator username/display name: ')).trim()
  const password = await rl.question('Master administrator password: ', { hideEchoBack: true })
  const confirmation = await rl.question('Confirm password: ', { hideEchoBack: true })
  if (!email || !username || !strong(password) || password !== confirmation) throw new Error('INVALID_PROVISIONING_INPUT')
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('MASTER_ACCOUNT_ALREADY_EXISTS_USE_ROTATE_COMMAND')
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.create({ data: {
    email, name: username, password: passwordHash, authType: 'LOCAL', role: 'MASTER_ADMIN',
    title: 'Master Administrator', isSalesperson: false, showOnSalesBoard: false,
    mustRotatePassword: true,
  } })
  console.log('MASTER_ADMIN_PROVISIONED=PASS')
} finally {
  rl.close()
  await prisma.$disconnect()
}

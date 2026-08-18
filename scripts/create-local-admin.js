const crypto = require("node:crypto")
const bcrypt = require("bcryptjs")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  const email = (process.env.LOCAL_ADMIN_EMAIL || "ben@titandiamond.net").trim().toLowerCase()
  const name = (process.env.LOCAL_ADMIN_NAME || "Ben Bequette").trim()
  const password = process.env.LOCAL_ADMIN_PASSWORD || `TD-local-${crypto.randomBytes(12).toString("base64url")}`
  const passwordHash = await bcrypt.hash(password, 12)

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, password: passwordHash, role: "ADMIN" },
    create: { email, name, password: passwordHash, role: "ADMIN" },
  })

  console.log(JSON.stringify({ email: user.email, password, role: user.role }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

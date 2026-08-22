const bcrypt = require("bcryptjs")
const { PrismaClient } = require("@prisma/client")

const databaseUrl = process.env.DATABASE_URL || ""
if (!databaseUrl.includes("tdgpt_dev")) {
  throw new Error("Refusing to change credentials outside the isolated development database.")
}

const prisma = new PrismaClient()

async function main() {
  const name = (process.env.DEV_TEST_REP_NAME || "ROSS HAISLER").trim()
  const password = process.env.DEV_TEST_REP_PASSWORD || "TDGPT-dev-rep-change-me"
  const user = await prisma.user.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, email: true, name: true, role: true },
  })

  if (!user) throw new Error(`Development sales rep not found: ${name}`)

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(password, 12) },
  })

  console.log(JSON.stringify({ email: user.email, password, name: user.name, role: user.role }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

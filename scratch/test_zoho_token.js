const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function testZohoToken() {
  console.log("=== CHECKING ZOHO OAUTH CREDENTIALS IN SYSTEM SETTINGS ===")

  const settings = await prisma.systemSetting.findMany()
  console.log("System Settings keys:", settings.map(s => s.key))

  const token = settings.find(s => s.key === 'zoho_access_token')?.value
  const clientId = settings.find(s => s.key === 'zoho_client_id')?.value
  const clientSecret = settings.find(s => s.key === 'zoho_client_secret')?.value

  console.log("zoho_access_token present:", !!token)
  console.log("zoho_client_id present:", !!clientId)
  console.log("zoho_client_secret present:", !!clientSecret)
}

testZohoToken()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

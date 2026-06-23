require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } })
  const token = tokenSetting.value

  const res = await fetch("https://voice.zoho.com/api/v1/call", {
    method: "POST",
    headers: {
      "Authorization": `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from_number: "+14804702577", // The default SMS line I found in settings
      to_number: "+16024445555" // dummy
    })
  })

  console.log("Status:", res.status)
  const data = await res.json()
  console.log(data)
}
main().finally(() => prisma.$disconnect())

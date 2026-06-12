const { PrismaClient } = require("@prisma/client")

async function test() {
  const prisma = new PrismaClient()
  const setting = await prisma.systemSetting.findUnique({where: {key: 'zoho_access_token'}})
  const access_token = setting.value

  const res = await fetch(`https://www.zohoapis.com/books/v3/contacts?organization_id=896250195&contact_name=RACANELLI%20REBAR`, {
    headers: { Authorization: `Zoho-oauthtoken ${access_token}` }
  })
  
  const data = await res.json()
  console.log("Contacts via name:")
  console.log(JSON.stringify(data.contacts || data, null, 2))
}

test()

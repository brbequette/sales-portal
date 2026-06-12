const { PrismaClient } = require("@prisma/client")

async function test() {
  const prisma = new PrismaClient()
  const setting = await prisma.systemSetting.findUnique({where: {key: 'zoho_access_token'}})
  const access_token = setting.value

  const payload = {
    contact_name: "RACANELLI REBAR",
    zcrm_account_id: "6821836000007073241"
  }

  const res = await fetch(`https://www.zohoapis.com/books/v3/contacts?organization_id=896250195`, {
    method: 'POST',
    headers: { 
      Authorization: `Zoho-oauthtoken ${access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  
  const data = await res.json()
  console.log("Create Contact Response:")
  console.log(JSON.stringify(data, null, 2))
}

test()

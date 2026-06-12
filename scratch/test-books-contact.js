const { PrismaClient } = require("@prisma/client")

async function test() {
  const prisma = new PrismaClient()
  const setting = await prisma.systemSetting.findUnique({where: {key: 'zoho_access_token'}})
  const access_token = setting.value

  const orgId = "664670946"

  // Fetch the contact matching zcrm_account_id
  let res = await fetch(`https://www.zohoapis.com/books/v3/contacts?organization_id=${orgId}&zcrm_account_id=6821836000007073241`, {
    headers: { Authorization: `Zoho-oauthtoken ${access_token}` }
  })
  let data = await res.json()
  console.log("Contacts via zcrm_account_id:")
  console.log(data.contacts && data.contacts.length ? data.contacts[0].contact_id : data)

  // Try fetching the contact directly by its zohoId
  res = await fetch(`https://www.zohoapis.com/books/v3/contacts/6821836000007073241?organization_id=${orgId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${access_token}` }
  })
  data = await res.json()
  console.log("Contact via ID directly:", data.message)
}

test()

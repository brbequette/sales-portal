require('dotenv').config()
const { getZohoAccessToken } = require('../netlify/functions/lib/zoho-auth')
async function run() {
  try {
    const t = await getZohoAccessToken()
    const ZOHO_DC = process.env.ZOHO_DC || 'com'
    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/settings/fields?module=Accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${t}` }
    })
    const data = await res.json()
    const f = data.fields?.find(x => x.api_name === 'Last_Purchase_Date')
    console.log('Last_Purchase_Date field:', f ? 'exists' : 'does not exist')
  } catch(e) {
    console.error(e.message)
  }
}
run()

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { getZohoAccessToken } = require('../netlify/functions/lib/zoho-auth')
const p = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'

async function run() {
  const token = await getZohoAccessToken()
  const r = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  })
  const d = await r.json()
  console.log(JSON.stringify(d, null, 2))
  process.exit(0)
}
run()

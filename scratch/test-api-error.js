require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { getZohoAccessToken } = require('../netlify/functions/lib/zoho-auth')
const p = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID

async function run() {
  const token = await getZohoAccessToken()
  const targetId = '1254360000037332528'
  const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${targetId}?organization_id=${ORG_ID}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  })
  console.log(`Status: ${res.status}`)
  console.log(await res.text())
  process.exit(0)
}
run()

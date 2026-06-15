require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { getZohoAccessToken } = require('../netlify/functions/lib/zoho-auth')
const p = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'

async function run() {
  const token = await getZohoAccessToken()
  const orgsRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  })
  const orgsData = await orgsRes.json()
  console.log(orgsData)
  process.exit(0)
}
run()

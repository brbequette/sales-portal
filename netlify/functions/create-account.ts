import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, error: "Method not allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { 
      accountName, phone, email, industry, tags, 
      billingStreet, billingCity, billingState, billingCode, billingCountry,
      shippingStreet, shippingCity, shippingState, shippingCode, shippingCountry,
      firstName, lastName, contactEmail, contactPhone, repId
    } = body

    if (!accountName) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Account Name is required" }) }
    }

    // Resolve owner's zohoId
    let ownerZohoId = null
    let ownerId = repId
    if (repId) {
      const rep = await prisma.user.findUnique({ where: { id: repId } })
      if (rep && rep.zohoId && !rep.zohoId.startsWith('mock-')) {
        ownerZohoId = rep.zohoId
      }
    }

    const token = await getZohoAccessToken();
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3`;

    // 1. Create Account in Zoho CRM
    const accountPayload: any = {
      Account_Name: accountName,
      Phone: phone,
      Email: email,
      Industry: industry,
      Billing_Street: billingStreet,
      Billing_City: billingCity,
      Billing_State: billingState,
      Billing_Code: billingCode,
      Billing_Country: billingCountry,
      Shipping_Street: shippingStreet,
      Shipping_City: shippingCity,
      Shipping_State: shippingState,
      Shipping_Code: shippingCode,
      Shipping_Country: shippingCountry,
    }
    
    if (tags) {
      // Tags in CRM API are usually an array of strings
      accountPayload.Tag = tags.split(',').map((t: string) => ({ name: t.trim() })).filter((t: any) => t.name)
    }

    if (ownerZohoId) {
      accountPayload.Owner = { id: ownerZohoId }
    }

    const crmRes = await fetch(`${baseUrl}/Accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: [accountPayload] })
    })

    const crmData = await crmRes.json()
    if (!crmRes.ok || crmData.data?.[0]?.code !== 'SUCCESS') {
      console.error("Zoho CRM Account Creation Failed:", crmData)
      return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: "Failed to create account in Zoho CRM", details: crmData }) }
    }

    const newAccountId = crmData.data[0].details.id

    // 2. Create Contact in Zoho CRM (if provided)
    if (firstName || lastName) {
      const contactPayload = {
        First_Name: firstName,
        Last_Name: lastName || 'Unknown',
        Email: contactEmail || email,
        Phone: contactPhone || phone,
        Account_Name: { id: newAccountId }
      }
      
      const contactRes = await fetch(`${baseUrl}/Contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: [contactPayload] })
      })
      const contactData = await contactRes.json()
      if (!contactRes.ok || contactData.data?.[0]?.code !== 'SUCCESS') {
        console.warn("Failed to create Contact in Zoho CRM. Account was created.", contactData)
      }
    }

    // 3. Create Account in Prisma Local DB
    // Find a fallback owner if ownerId wasn't passed or doesn't exist
    if (!ownerId) {
      const fallbackUser = await prisma.user.findFirst()
      if (fallbackUser) ownerId = fallbackUser.id
    }

    const prismaAccount = await prisma.account.create({
      data: {
        zohoId: newAccountId,
        name: accountName,
        industry: industry || null,
        tags: tags || null,
        status: 'Open',
        quality: 'WARM',
        ownerId: ownerId,
      }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, zohoId: newAccountId, account: prismaAccount })
    }

  } catch (err: any) {
    console.error("create-account error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { accountId } = body

    if (!accountId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing accountId" }) }
    }

    // Find account in DB
    const account = await prisma.account.findUnique({
      where: { zohoId: accountId },
      include: { contacts: true }
    })

    if (!account) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: "Account not found in local DB" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // --- Step 1: Check if contact already exists in Zoho Books ---
    const searchRes = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}&contact_name=${encodeURIComponent(account.name)}`, {
      headers: authHeaders
    })
    const searchData: any = await searchRes.json()
    
    if (searchRes.ok && searchData.contacts && searchData.contacts.length > 0) {
      // Check for exact name match or matching CRM account ID
      const existing = searchData.contacts.find((c: any) => 
        c.contact_name?.toLowerCase() === account.name.toLowerCase() ||
        c.zcrm_account_id === account.zohoId
      )
      if (existing) {
        return {
          statusCode: 200,
          headers: cors,
          body: JSON.stringify({ 
            success: true, 
            alreadyExists: true,
            message: `Account "${account.name}" already exists in Zoho Books (ID: ${existing.contact_id}).`,
            booksContact: existing
          })
        }
      }
    }

    // --- Step 2: Build full payload with address info ---
    const primaryContact = account.contacts?.find(c => c.isPrimary) || account.contacts?.[0]
    
    const payload: any = {
      contact_name: account.name,
      company_name: account.name,
      zcrm_account_id: account.zohoId,
      customer_sub_type: "business",
      // Billing address
      billing_address: {
        street: account.billingStreet || "",
        city: account.billingCity || "",
        state: account.billingState || "",
        zip: account.billingZip || "",
        country: "US"
      },
      // Shipping address
      shipping_address: {
        street: account.shippingStreet || account.billingStreet || "",
        city: account.shippingCity || account.billingCity || "",
        state: account.shippingState || account.billingState || "",
        zip: account.shippingZip || account.billingZip || "",
        country: "US"
      }
    }

    // Add phone if available
    if (primaryContact?.phone) {
      payload.phone = primaryContact.phone
    } else if (primaryContact?.mobilePhone) {
      payload.phone = primaryContact.mobilePhone
    }

    // Add primary contact person
    if (primaryContact) {
      payload.contact_persons = [{
        first_name: primaryContact.firstName || "Unknown",
        last_name: primaryContact.lastName || "Unknown",
        email: primaryContact.email || "",
        phone: primaryContact.phone || primaryContact.mobilePhone || "",
        mobile: primaryContact.mobilePhone || "",
        is_primary_contact: true
      }]
    }

    // --- Step 3: Create the contact ---
    const res = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    const data = await res.json()

    if (!res.ok || data.code !== 0) {
      console.error("Zoho Books API Error:", data)
      if (data.message && data.message.toLowerCase().includes("already exists")) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, alreadyExists: true, message: "Account already exists in Zoho Books." }) }
      }
      throw new Error(data.message || `API error ${res.status}`)
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, message: "Successfully pushed to Zoho Books with full address info", booksContact: data.contact })
    }

  } catch (error: any) {
    console.error("Create Books Contact Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

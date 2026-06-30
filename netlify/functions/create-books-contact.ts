import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

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

    // Extract primary contact data if any
    const primaryContact = account.contacts?.find(c => c.isPrimary) || account.contacts?.[0]
    
    // Create payload for Zoho Books Contact
    const payload: any = {
      contact_name: account.name,
      company_name: account.name,
      zcrm_account_id: account.zohoId,
      customer_sub_type: "business"
    }

    if (primaryContact) {
      payload.contact_persons = [{
        first_name: primaryContact.firstName || "Unknown",
        last_name: primaryContact.lastName || "Unknown",
        email: primaryContact.email || "",
        phone: primaryContact.phone || "",
        is_primary_contact: true
      }]
    }

    const res = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    const data = await res.json()

    if (!res.ok || data.code !== 0) {
      console.error("Zoho Books API Error:", data)
      // Check if it's already in books (code usually 1000 for duplicate, but can vary)
      if (data.message && data.message.toLowerCase().includes("already exists")) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: "Account already exists in Zoho Books." }) }
      }
      throw new Error(data.message || `API error ${res.status}`)
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, message: "Successfully pushed to Zoho Books", booksContact: data.contact })
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

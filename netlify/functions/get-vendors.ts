import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // Fetch vendors from Zoho Books
    const res = await fetch(`${baseUrl}/contacts?contact_type=vendor&organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    
    const data = await res.json()
    if (data.code !== 0) {
      throw new Error(`Zoho Books API Error: ${data.message}`)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, vendors: data.contacts })
    }

  } catch (err: any) {
    console.error("get-vendors error:", err)
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

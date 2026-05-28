import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Module-level token cache
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;
const ZOHO_DC = process.env.ZOHO_DC || 'com';

async function getZohoAccessToken() {
  const now = Date.now();

  // 1. Return cached token if still valid
  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }

  // 2. Try OAuth refresh_token flow
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    try {
      const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      });

      const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await res.json();
      if (data.access_token) {
        _cachedToken = data.access_token;
        _tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
        return _cachedToken;
      }
      console.warn('Zoho Token Refresh failed:', JSON.stringify(data));
    } catch (e: any) {
      console.warn('Zoho Token fetch error:', e.message);
    }
  }

  // 3. Fallback: use a static access token set as an env var if defined
  if (process.env.ZOHO_ACCESS_TOKEN) {
    _cachedToken = process.env.ZOHO_ACCESS_TOKEN;
    _tokenExpiresAt = now + 55 * 60 * 1000;
    return _cachedToken;
  }

  throw new Error('No Zoho access token available. Please set ZOHO_REFRESH_TOKEN in Environment Variables.');
}

export const handler: Handler = async (event, context) => {
  // Allow GET requests
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const { zohoId, email } = event.queryStringParameters || {}

    if (!zohoId && !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing zohoId or email parameter" })
      }
    }

    let user = null

    // 1. Try to find the user by their Zoho CRM User ID
    if (zohoId) {
      user = await prisma.user.findUnique({ where: { zohoId: zohoId } })
    }

    // 2. Fall back to finding them by email
    if (!user && email) {
      user = await prisma.user.findUnique({ where: { email: email } })
    }

    if (!user) {
      console.log(`User not found in local DB. ZohoId: ${zohoId}, Email: ${email}. Auto-creating...`)
      user = await prisma.user.create({
        data: {
          email: email || `${zohoId}@titandiamond.net`,
          zohoId: zohoId || `mock-zoho-${Date.now()}`,
          name: email ? email.split('@')[0] : 'Demo User',
          role: 'Sales Representative'
        }
      })
    }

    // 3. Sync LIVE accounts from Zoho CRM!
    if (user.zohoId && !user.zohoId.startsWith('mock-zoho')) {
      try {
        const token = await getZohoAccessToken();
        const baseUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`;
        
        // Search Zoho CRM for Accounts assigned to this user
        const searchRes = await fetch(`${baseUrl}/search?criteria=(Owner.id:equals:${user.zohoId})`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const zohoAccounts = searchData.data || [];
          
          if (zohoAccounts.length > 0) {
            console.log(`Found ${zohoAccounts.length} live accounts from Zoho for user ${user.email}`);
            // Upsert each account into our local Prisma DB
            for (const record of zohoAccounts) {
              let status = 'Open'
              const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null
              if (lastPurchaseDate) {
                const twelveMonthsAgo = new Date()
                twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
                status = lastPurchaseDate < twelveMonthsAgo ? 'Update Status' : 'Personal'
              }

              await prisma.account.upsert({
                where: { zohoId: record.id },
                update: {
                  name: record.Account_Name || record.name || 'Unnamed Account',
                  industry: record.Industry || 'Unknown',
                  status: status,
                  lastPurchaseAt: lastPurchaseDate,
                  ownerId: user.id,
                },
                create: {
                  zohoId: record.id,
                  name: record.Account_Name || record.name || 'Unnamed Account',
                  industry: record.Industry || 'Unknown',
                  status: status,
                  lastPurchaseAt: lastPurchaseDate,
                  ownerId: user.id,
                }
              })
            }
          }
        } else {
          console.warn(`Zoho CRM API responded with status ${searchRes.status} ${searchRes.statusText}`);
          const text = await searchRes.text();
          console.warn(`Zoho CRM API Error body: ${text}`);
        }
      } catch (zohoError) {
        console.error("Failed to sync with live Zoho CRM:", zohoError);
      }
    }

    // 4. Fetch the newly synced accounts from the local DB
    const accounts = await prisma.account.findMany({
      where: { ownerId: user.id },
      orderBy: { name: 'asc' }
    })

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, accounts })
    }

  } catch (error: any) {
    console.error("Get Accounts Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

async function main() {
  console.log("=== ZOHO BOOKS SEARCH ===")
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"
  const ZOHO_DC = process.env.ZOHO_DC || "com"

  if (!refreshToken || !clientId || !clientSecret) {
    console.error("Missing Zoho credentials in env:", { refreshToken: !!refreshToken, clientId: !!clientId, clientSecret: !!clientSecret })
    return
  }

  // Get token
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  })

  const tokenRes = await fetch(`https://accounts.zoho.com/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  const tokenData = await tokenRes.json()
  const token = tokenData.access_token
  if (!token) {
    console.error("Failed to get Zoho token:", tokenData)
    return
  }

  // Search by SKU in Zoho Books
  const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ORG_ID}&search_text=SMX50VT`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  })
  const data = await res.json()
  if (data.code === 0 && data.items) {
    console.log(`Found ${data.items.length} matching items:`)
    for (const item of data.items) {
      console.log(`- SKU: ${item.sku}, Name: ${item.name}, Rate: ${item.rate}, Purchase Rate: ${item.purchase_rate}`)
    }
  } else {
    console.log("Error or no items in Zoho Books:", data)
  }
}

main().catch(console.error)

const { getZohoAccessToken } = require("./netlify/functions/lib/zoho-auth")

async function test() {
  const token = await getZohoAccessToken()
  const ZOHO_DC = process.env.ZOHO_DC || 'com'
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

  // 1. Get item by SKU
  const sku = "SMX30NT0408CMK" // THE TITAN 4
  const searchUrl = `${baseUrl}/items?organization_id=${ORG_ID}&sku=${encodeURIComponent(sku)}`
  
  console.log("Searching for:", searchUrl)
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  })
  
  const searchData = await searchRes.json()
  console.log("Search Result Code:", searchData.code)
  
  if (searchData.items && searchData.items.length > 0) {
    const item = searchData.items[0]
    console.log("Found Item ID:", item.item_id)
    console.log("Has Image?", item.image_name)
    
    if (item.image_name) {
      // 2. Fetch Image
      const imageUrl = `${baseUrl}/items/${item.item_id}/image?organization_id=${ORG_ID}`
      console.log("Fetching image from:", imageUrl)
      
      const imgRes = await fetch(imageUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      
      console.log("Image Status:", imgRes.status)
      console.log("Content-Type:", imgRes.headers.get("content-type"))
      
      const buffer = await imgRes.arrayBuffer()
      console.log("Image size (bytes):", buffer.byteLength)
    } else {
      console.log("Item does not have an image in Zoho Books.")
    }
  } else {
    console.log("Item not found in Zoho Books.")
  }
}

test()

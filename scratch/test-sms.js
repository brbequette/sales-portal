async function getZohoAccessToken() {
  const refreshToken = process.env.ZOHO_SMS_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN
  if (!refreshToken) return null;
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.ZOHO_SMS_CLIENT_ID || process.env.ZOHO_CLIENT_ID || '',
    client_secret: process.env.ZOHO_SMS_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || '',
    grant_type: "refresh_token",
  })
  
  try {
    const res = await fetch(`https://accounts.zoho.${process.env.ZOHO_DC || 'com'}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    const data = await res.json()
    console.log("Token response:", data)
    return data.access_token
  } catch (e) {
    console.error("Error refreshing Zoho Token:", e)
    return null
  }
}

async function test() {
  const accessToken = await getZohoAccessToken()
  console.log("Access token length:", accessToken ? accessToken.length : 0)

  const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
  
  const smsData = {
    customerNumber: "'+18177579730",
    message: "Test message from API",
    senderId: process.env.ZOHO_VOICE_FROM_NUMBER || '',
    mms: false
  }
  
  const formData = new FormData()
  formData.append('sms_data', JSON.stringify(smsData))

  const smsRes = await fetch(zohoVoiceUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`
    },
    body: formData
  })

  if (smsRes.ok) {
     const resData = await smsRes.json()
     console.log("Success:", resData)
  } else {
     const errorData = await smsRes.text()
     console.error(`Zoho Voice API failed:`, errorData)
  }
}

test()

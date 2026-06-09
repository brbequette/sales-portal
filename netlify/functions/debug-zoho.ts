import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  const refreshToken = process.env.ZOHO_SMS_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN
  const clientId = process.env.ZOHO_SMS_CLIENT_ID || process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_SMS_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET
  const fromNumber = process.env.ZOHO_VOICE_FROM_NUMBER

  const params = new URLSearchParams({
    refresh_token: refreshToken || '',
    client_id: clientId || '',
    client_secret: clientSecret || '',
    grant_type: "refresh_token",
  })
  
  try {
    const res = await fetch(`https://accounts.zoho.${process.env.ZOHO_DC || 'com'}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    const data = await res.json()
    const accessToken = data.access_token

    if (!accessToken) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ error: "Failed token", data }) }
    }

    const testNumber = event.queryStringParameters?.phone || "+16183355304"
    const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
    
    const smsData = {
      customerNumber: testNumber,
      message: "Debug test",
      senderId: fromNumber || '',
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

    const text = await smsRes.text()

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        tokenSuccess: true, 
        smsStatus: smsRes.status, 
        smsResponse: text,
        fromNumber
      })
    }
  } catch (e: any) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) }
  }
}

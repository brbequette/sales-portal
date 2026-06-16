require('dotenv').config()
const fs = require('fs')

async function run() {
  const ZOHO_DC = process.env.ZOHO_DC || 'com'
  
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })

  const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  
  const tokenData = await res.json()
  const accessToken = tokenData.access_token
  
  if (!accessToken) return console.log("No token:", tokenData)

  const zohoVoiceUrl = `https://voice.zoho.com/rest/json/v2/sms/send`
  
  const smsData = {
    customerNumber: "+16183355304", 
    message: "Test image message",
    senderId: process.env.ZOHO_VOICE_FROM_NUMBER || "+14804702577",
    mms: true
  }
  
  const formData = new FormData()
  formData.append('sms_data', JSON.stringify(smsData))

  // Dummy 1x1 png base64
  const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  const buffer = Buffer.from(base64Data, 'base64')
  const blob = new Blob([buffer], { type: "image/png" })
  formData.append('mms_media', blob, "attachment.png")

  const smsRes = await fetch(zohoVoiceUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`
    },
    body: formData
  })

  const text = await smsRes.text()
  console.log("Response:", smsRes.status, text)
}

run()

const { PrismaClient } = require('@prisma/client')

async function run() {
  const prisma = new PrismaClient()
  try {
    const settings = await prisma.systemSettings.findFirst()
    const accessToken = settings.zohoAccessToken
    
    if (!accessToken) return console.log("No token in DB")

    const zohoVoiceUrl = `https://voice.zoho.com/rest/json/v2/sms/send`
    
    const smsData = {
      customerNumber: "+16183355304", 
      message: "Test image message",
      senderId: "+14804702577",
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
  } catch (e) {
    console.error(e)
  } finally {
    await prisma.$disconnect()
  }
}

run()

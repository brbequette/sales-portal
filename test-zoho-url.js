const fetch = require('node-fetch');
const { getZohoAccessToken } = require('./netlify/functions/lib/zoho-auth');

async function test() {
  const token = await getZohoAccessToken();
  const smsData = {
    customerNumber: "+15094665555",
    message: "Test Message",
    senderId: "123", // Need actual from number
    mms: false
  };

  try {
    const res = await fetch("https://voice.zoho.com/rest/json/v2/sms/send", {
      method: "POST",
      headers: {
        "Authorization": `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `sms_data=${encodeURIComponent(JSON.stringify(smsData))}`
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (err) {
    console.error("Fetch err:", err);
  }
}

test();

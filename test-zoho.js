const { getZohoAccessToken } = require('./netlify/functions/lib/zoho-auth');

async function test() {
  const token = await getZohoAccessToken();
  console.log("Token:", token ? "Exists" : "Missing");

  const formData = new FormData();
  formData.append('sms_data', JSON.stringify({
    customerNumber: "+15094665555",
    message: "Test Message",
    senderId: "123", // Need actual from number
    mms: false
  }));

  try {
    const res = await fetch("https://voice.zoho.com/rest/json/v2/sms/send", {
      method: "POST",
      headers: {
        "Authorization": `Zoho-oauthtoken ${token}`
      },
      body: formData
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (err) {
    console.error("Fetch err:", err);
  }
}

test();

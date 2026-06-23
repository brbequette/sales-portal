const fs = require('fs');

async function testLocalApi() {
  const payload = {
    accountIds: ["cmqbcwcng0259vo780ph4nv76"], // CURTIS CONCRETE CONSTRUCTION (has +15094665555)
    channel: "SMS",
    text: "FREE 85\" TV",
    // We pass a dummy base64 image just to test the logic
    imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  };

  try {
    const res = await fetch("http://localhost:3000/api/send-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (err) {
    console.error("Fetch err:", err);
  }
}

testLocalApi();

const fs = require('fs');
const fetch = require('node-fetch');

async function testTransaction() {
  try {
    const payload = {
      accountId: "6821836000002575001", // Or some known Zoho ID
      type: "SalesOrder",
      amount: 100,
      items: ["1x Test Item - $100 ea"],
      lineItems: [
        { name: "Test Item", description: "Test", rate: 100, quantity: 1 }
      ],
      discountTotal: 0
    };

    console.log("Testing POST to create-transaction...");
    const res = await fetch("https://titan-sales-portal.netlify.app/api/create-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("Response:", data);
  } catch (err) {
    console.error("Test Error:", err);
  }
}

testTransaction();

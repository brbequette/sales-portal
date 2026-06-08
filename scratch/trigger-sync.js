async function main() {
  const url = 'http://localhost:8888/.netlify/functions/get-accounts?zohoId=6821836000000636001&email=6821836000000636001@dummy.titandiamond.net';
  console.log("Sending GET request to:", url);
  try {
    const res = await fetch(url);
    console.log("Response status:", res.status, res.statusText);
    const data = await res.json();
    console.log("Success:", data.success);
    if (data.accounts) {
      console.log(`Synced accounts count returned: ${data.accounts.length}`);
      const withInvoices = data.accounts.filter(a => a.invoices && a.invoices.length > 0);
      console.log(`Accounts containing synced invoices: ${withInvoices.length}`);
      if (withInvoices.length > 0) {
        console.log("Sample Account Invoices Sample:", JSON.stringify(withInvoices[0].invoices.slice(0, 2), null, 2));
      }
    } else {
      console.log("Response body:", JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("HTTP request failed:", e.message);
  }
}

main();

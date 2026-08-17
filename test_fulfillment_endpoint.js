async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/zoho-fulfillment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'GetSalesOrder',
        salesOrderId: '1254360000049362001' // SO 46516 Zoho ID
      })
    });
    const data = await res.json();
    console.log('Fulfillment Endpoint Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();

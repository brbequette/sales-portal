const { getConnectionString } = require('@netlify/database');
async function test() {
  try {
    const url = await getConnectionString();
    console.log("URL:", url);
  } catch (e) {
    console.log("Sync error:", e.message);
    try {
      console.log("URL Sync:", getConnectionString());
    } catch(e2) {
      console.log("Error 2:", e2.message);
    }
  }
}
test();

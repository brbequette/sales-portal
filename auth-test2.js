require('dotenv').config();
const { getZohoAccessToken } = require('./netlify/functions/lib/zoho-auth.js');
(async () => {
  const t = await getZohoAccessToken();
  const res = await fetch('https://www.zohoapis.com/books/v3/organizations', {
    headers: { Authorization: 'Zoho-oauthtoken ' + t }
  });
  console.log(res.status);
  console.log(await res.text());
})();

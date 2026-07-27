const https = require('https');

https.get('https://www.tdusales.com/api/get-commissions?includeHidden=true&year=2026', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body length:', data.length);
    console.log('Body snippet:', data.substring(0, 300));
  });
}).on('error', err => console.error(err));

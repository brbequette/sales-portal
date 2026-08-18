const https = require('https');

https.get('https://www.tdusales.com/api/get-commissions?includeHidden=true&year=all', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Body length:', data.length);
    console.log('Body snippet:', data.substring(0, 300));
  });
}).on('error', err => console.error(err));

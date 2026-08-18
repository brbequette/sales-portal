const https = require('https');

function testEndpoint(urlStr) {
  return new Promise((resolve) => {
    https.get(urlStr, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`URL: ${urlStr} => Status ${res.statusCode}`);
        console.log(`Snippet: ${data.substring(0, 200)}\n`);
        resolve(res.statusCode);
      });
    }).on('error', err => {
      console.error(`URL: ${urlStr} => Error ${err.message}`);
      resolve(500);
    });
  });
}

async function main() {
  await testEndpoint('https://www.tdusales.com/api/timeclock/get-entries');
  await testEndpoint('https://www.tdusales.com/api/timeclock/geofences');
}

main();

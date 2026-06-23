const https = require('https');
const { getZohoAccessToken } = require('./netlify/functions/lib/zoho-auth');

async function test() {
  const token = await getZohoAccessToken();
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  
  let data = `--${boundary}\r\n`;
  data += `Content-Disposition: form-data; name="sms_data"\r\n\r\n`;
  data += `{"customerNumber":"+15094665555","message":"Test Message","senderId":"123","mms":false}\r\n`;
  data += `--${boundary}--\r\n`;

  const options = {
    hostname: 'voice.zoho.com',
    port: 443,
    path: '/rest/json/v2/sms/send',
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(data)
    },
    insecureHTTPParser: true
  };

  const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => { console.log('BODY:', body); });
  });

  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  req.write(data);
  req.end();
}

test();

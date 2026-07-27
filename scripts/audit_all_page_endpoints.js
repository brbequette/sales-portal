const http = require('https');

const BASE_URL = 'https://www.tdusales.com';

const endpoints = [
  '/api/get-user',
  '/api/get-users',
  '/api/get-accounts',
  '/api/zoho-invoices',
  '/api/get-collections',
  '/api/get-commissions',
  '/api/get-rep-stats',
  '/api/shipping',
  '/api/get-tasks',
  '/api/get-products',
  '/api/get-vendors',
  '/api/admin/users',
  '/api/admin/vendors',
  '/api/admin/campaigns',
  '/api/admin/communications',
  '/api/admin/scripts',
  '/api/admin/settings',
  '/api/admin/geofences',
  '/api/timeclock/get-entries',
  '/api/messages',
  '/api/get-documents',
  '/api/get-media-assets'
];

async function checkEndpoint(path) {
  return new Promise((resolve) => {
    const url = BASE_URL + path;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          let count = 0;
          if (Array.isArray(json)) count = json.length;
          else if (Array.isArray(json.data)) count = json.data.length;
          else if (Array.isArray(json.users)) count = json.users.length;
          else if (Array.isArray(json.accounts)) count = json.accounts.length;
          else if (Array.isArray(json.invoices)) count = json.invoices.length;
          else if (Array.isArray(json.tasks)) count = json.tasks.length;
          else if (Array.isArray(json.products)) count = json.products.length;
          else if (Array.isArray(json.vendors)) count = json.vendors.length;
          else if (Array.isArray(json.entries)) count = json.entries.length;

          resolve({
            path,
            status: res.statusCode,
            success: json.success !== false && !json.error,
            count,
            error: json.error || null,
            keys: Object.keys(json).slice(0, 5)
          });
        } catch (err) {
          resolve({
            path,
            status: res.statusCode,
            success: false,
            error: 'Invalid JSON: ' + data.slice(0, 100)
          });
        }
      });
    }).on('error', (err) => {
      resolve({ path, status: 0, success: false, error: err.message });
    });
  });
}

async function runAudit() {
  console.log('--- STARTING LIVE API ENDPOINT AUDIT ---');
  for (const ep of endpoints) {
    const res = await checkEndpoint(ep);
    console.log(`[${res.status}] ${res.path} -> Success: ${res.success} | Items: ${res.count || 0} | Error: ${res.error || 'None'}`);
  }
  console.log('--- AUDIT COMPLETE ---');
}

runAudit();

const required = ['DATABASE_URL','ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN','ZOHO_ORGANIZATION_ID','ZOHO_DC'];
for (const name of required) {
  if (!process.env[name] || !String(process.env[name]).trim()) {
    console.error(name);
    process.exit(1);
  }
}
console.log('CREDENTIAL_NAMES=PASS');

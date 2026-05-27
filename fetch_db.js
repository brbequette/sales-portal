const { execSync } = require('child_process');
const fs = require('fs');

try {
  console.log("Fetching Netlify Environment Variables...");
  const result = execSync(`npx netlify api getSiteEnvVars --data "{ \\"site_id\\": \\"61a15791-b7ec-4746-b495-7772abd22840\\" }"`, { encoding: 'utf8' });
  const envVars = JSON.parse(result);
  
  // Find the database URL provided by Neon/Netlify
  let dbUrl = '';
  if (envVars.NETLIFY_DATABASE_URL && envVars.NETLIFY_DATABASE_URL.values.length > 0) {
    dbUrl = envVars.NETLIFY_DATABASE_URL.values[0].value;
  } else if (envVars.DATABASE_URL && envVars.DATABASE_URL.values.length > 0) {
    dbUrl = envVars.DATABASE_URL.values[0].value;
  }
  
  if (dbUrl) {
    console.log("Found Database URL, injecting into .env...");
    let envFile = fs.readFileSync('.env', 'utf8');
    // Replace dummy with actual
    envFile = envFile.replace(/NETLIFY_DATABASE_URL=".*"/g, `NETLIFY_DATABASE_URL="${dbUrl}"`);
    fs.writeFileSync('.env', envFile);
    console.log("Successfully linked local environment to the cloud database!");
  } else {
    console.log("No database URL found in the Netlify environment.");
  }
} catch (e) {
  console.error("Failed to fetch environment variables", e.message);
}

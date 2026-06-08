const { execSync } = require('child_process');

try {
  const result = execSync(`npx netlify api getSiteEnvVars --data "{ \\"site_id\\": \\"61a15791-b7ec-4746-b495-7772abd22840\\" }"`, { encoding: 'utf8' });
  const envVars = JSON.parse(result);
  console.log("Netlify Environment Variables:");
  envVars.forEach(v => {
    console.log(`${v.key}: ${v.values[0]?.value || 'empty'}`);
  });
} catch (e) {
  console.error("Failed to fetch env vars:", e.message);
}

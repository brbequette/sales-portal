const { execSync } = require('child_process');

try {
  const result = execSync(`npx netlify api getSite --data "{ \\"site_id\\": \\"61a15791-b7ec-4746-b495-7772abd22840\\" }"`, { encoding: 'utf8' });
  const site = JSON.parse(result);
  console.log("Site URL:", site.url);
  console.log("Site Name:", site.name);
  console.log("Admin URL:", site.admin_url);
} catch (e) {
  console.error("Failed to fetch site URL:", e.message);
}

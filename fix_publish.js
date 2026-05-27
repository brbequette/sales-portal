const { execSync } = require('child_process');
const payload = JSON.stringify({
  site_id: "61a15791-b7ec-4746-b495-7772abd22840",
  body: { build_settings: { dir: null } }
}).replace(/"/g, '\\"');
console.log("Fixing publish directory...");
try {
  execSync(`npx netlify api updateSite --data "${payload}"`, { stdio: 'inherit' });
  console.log("Publish directory cleared!");
} catch (e) {
  console.error("Failed", e.message);
}

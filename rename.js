const { execSync } = require('child_process');
const payload = JSON.stringify({
  site_id: "61a15791-b7ec-4746-b495-7772abd22840",
  body: { name: "titan-sales-portal" }
}).replace(/"/g, '\\"');
console.log("Executing rename API...");
try {
  execSync(`npx netlify api updateSite --data "${payload}"`, { stdio: 'inherit' });
  console.log("Successfully renamed!");
} catch (e) {
  console.error("Rename failed");
}

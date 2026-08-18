const { execSync } = require('child_process');
const fs = require('fs');

try {
  // Fetch latest deploys
  const deploysStr = execSync(`npx.cmd netlify api listSiteDeploys --data "{ \\"site_id\\": \\"61a15791-b7ec-4746-b495-7772abd22840\\" }"`, { encoding: 'utf8' });
  const deploys = JSON.parse(deploysStr);
  
  // Find the build deploy (the one with commit_ref 377281081ce162de0ae8680372b0649f12f4d1f0)
  const targetDeploy = deploys.find(d => d.commit_ref === '377281081ce162de0ae8680372b0649f12f4d1f0');
  
  if (!targetDeploy) {
    console.log("Could not find the migration deploy in the history.");
    process.exit(1);
  }
  
  console.log("Migration Deploy ID:", targetDeploy.id);
  console.log("State:", targetDeploy.state);
  console.log("Error:", targetDeploy.error_message);
  
  // Try to get log stream URL or access logs
  // Netlify logs are streaming, we can try to fetch the log using api or netlify cli if available.
  console.log("Fetching deploy log...");
  // Netlify CLI doesn't have a direct log command, but we can curl the log stream or use api
  const token = execSync(`npx.cmd netlify api getSite --data "{ \\"site_id\\": \\"61a15791-b7ec-4746-b495-7772abd22840\\" }"`, { encoding: 'utf8' });
  // Let's just fetch the deploy details
  const deployDetailsStr = execSync(`npx.cmd netlify api getDeploy --data "{ \\"deploy_id\\": \\"${targetDeploy.id}\\" }"`, { encoding: 'utf8' });
  const deployDetails = JSON.parse(deployDetailsStr);
  console.log("Deploy details:", {
    summary: deployDetails.summary,
    admin_url: deployDetails.admin_url,
    build_id: deployDetails.build_id
  });
} catch (e) {
  console.error("Failed to fetch deploy logs:", e.message);
}

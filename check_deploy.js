const { execSync } = require('child_process');
try {
  const result = execSync(`npx netlify api listSiteDeploys --data "{ \\"site_id\\": \\"61a15791-b7ec-4746-b495-7772abd22840\\" }"`, { encoding: 'utf8' });
  const deploys = JSON.parse(result);
  const latestDeploy = deploys[0];
  console.log("Latest Deploy State:", latestDeploy.state);
  console.log("Available Functions:", latestDeploy.available_functions);
  console.log("Publish Dir:", latestDeploy.build_settings);
} catch (e) {
  console.error("Failed to fetch deploy status", e.message);
}

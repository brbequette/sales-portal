const { execSync } = require('child_process');
try {
  const result = execSync(`npx.cmd netlify api listSiteDeploys --data "{ \\"site_id\\": \\"61a15791-b7ec-4746-b495-7772abd22840\\" }"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  const deploys = JSON.parse(result);
  const latestDeploy = deploys[0];
  console.log("Latest Deploy State:", latestDeploy.state);
  console.log("Context:", latestDeploy.context);
  console.log("Commit Ref:", latestDeploy.commit_ref);
  console.log("Commit Title:", latestDeploy.title);
  console.log("Deploy URL:", latestDeploy.deploy_ssl_url || latestDeploy.url);
  console.log("Error Message:", latestDeploy.error_message);
} catch (e) {
  console.error("Failed to fetch deploy status", e.message);
}

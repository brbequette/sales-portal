const { execSync } = require('child_process');

console.log("Staging files...");
execSync("git add .", { stdio: "inherit" });

console.log("Committing files...");
execSync('git commit -m "feat: complete Phase 1-4 refactoring, security, sub-routes, zohoCache, and automations"', { stdio: "inherit" });

console.log("Git commit complete!");

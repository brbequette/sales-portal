const fs = require('fs');
const path = require('path');

async function main() {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const configDirs = [
      path.join(home, 'AppData', 'Roaming', 'netlify', 'config.json'),
      path.join(home, '.config', 'netlify', 'config.json'),
      path.join(home, '.netlify', 'config.json')
    ];
    
    let token = '';
    for (const configDir of configDirs) {
      if (fs.existsSync(configDir)) {
        try {
          const config = JSON.parse(fs.readFileSync(configDir, 'utf8'));
          token = config.users?.[config.userId]?.accessToken || config.accessToken || '';
          if (token) {
            console.log("Found Netlify Access Token in:", configDir);
            break;
          }
        } catch (err) {}
      }
    }
    
    if (!token) {
      console.error("Could not find Netlify Access Token in local config files.");
      process.exit(1);
    }
    
    const siteId = "61a15791-b7ec-4746-b495-7772abd22840";
    const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch deploys: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    
    const deploys = await res.json();
    if (deploys && deploys.length > 0) {
      const latest = deploys[0];
      console.log(`Latest Deploy:`);
      console.log(`- State: ${latest.state}`);
      console.log(`- Commit Ref: ${latest.commit_ref}`);
      console.log(`- Commit Title: ${latest.title}`);
      console.log(`- Deploy URL: ${latest.deploy_ssl_url || latest.url}`);
    } else {
      console.log("No deploys found.");
    }
  } catch (error) {
    console.error("Error checking Netlify deploys:", error);
  }
}

main();

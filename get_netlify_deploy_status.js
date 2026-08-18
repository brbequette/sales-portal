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
    
    // Fetch sites to find the right one
    const sitesRes = await fetch("https://api.netlify.com/api/v1/sites", {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!sitesRes.ok) {
      throw new Error(`Failed to fetch sites: ${sitesRes.status} ${sitesRes.statusText}`);
    }
    const sites = await sitesRes.json();
    const site = sites.find(s => s.name?.includes("titan-sales-portal") || s.name?.includes("titan-diamond") || s.url?.includes("titan-sales-portal"));
    
    if (!site) {
      console.log("No site matching 'titan-sales-portal' found in sites list. Available sites:", sites.map(s => s.name));
      process.exit(1);
    }
    
    console.log(`Found Site: ${site.name} (ID: ${site.id})`);
    
    // Fetch latest deploys
    const deploysRes = await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/deploys?per_page=5`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!deploysRes.ok) {
      throw new Error(`Failed to fetch deploys: ${deploysRes.status} ${deploysRes.statusText}`);
    }
    const deploys = await deploysRes.json();
    console.log("Recent Deploys:");
    for (const d of deploys) {
      console.log({
        id: d.id,
        state: d.state,
        context: d.context,
        commit_ref: d.commit_ref,
        commit_message: d.title,
        created_at: d.created_at,
        deployed_at: d.deployed_at,
        error_message: d.error_message
      });
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

main();

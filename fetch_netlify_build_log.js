const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Determine Netlify config path
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
    
    const deployId = '6a26fc97b59e47000803c6fe';
    console.log(`Fetching Netlify build log for deploy ${deployId}...`);
    
    const res = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}/log`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch logs: ${res.status} ${res.statusText}`);
      const body = await res.text();
      console.error(body);
      process.exit(1);
    }
    
    const logsText = await res.text();
    // Print the last 100 lines
    const lines = logsText.split('\n');
    console.log(`--- LAST 100 LINES OF BUILD LOG ---`);
    console.log(lines.slice(-100).join('\n'));
    
  } catch (error) {
    console.error("Error fetching logs:", error);
  }
}

main();

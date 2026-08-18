const fs = require('fs');
const path = require('path');

const home = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\titan';

function search(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      
      if (stat.isDirectory()) {
        if (file.startsWith('.') || file === 'AppData' || file === 'Local' || file === 'Roaming' || file === 'netlify' || file === 'config') {
          search(fullPath, depth + 1);
        }
      } else if (file === 'config.json' && dir.includes('netlify')) {
        console.log("FOUND config.json at:", fullPath);
      }
    }
  } catch (err) {}
}

console.log("Searching config.json from home:", home);
search(home);
search(path.join(home, 'AppData'));

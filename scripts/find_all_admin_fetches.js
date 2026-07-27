const fs = require('fs');
const path = require('path');

function walk(d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const c = fs.readFileSync(p, 'utf8');
      const matches = c.match(/fetch\(['"`]\/api\/[^'"`]+['"`]/g);
      if (matches) {
        console.log(p, matches);
      }
    }
  });
}

walk('./src/app/admin');

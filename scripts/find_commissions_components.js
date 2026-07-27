const fs = require('fs');
const path = require('path');

function walk(d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const c = fs.readFileSync(p, 'utf8');
      if (f.toLowerCase().includes('commission') || f.toLowerCase().includes('payout')) {
        console.log('File:', p);
      }
    }
  });
}

walk('./src');

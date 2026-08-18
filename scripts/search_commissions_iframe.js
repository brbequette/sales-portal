const fs = require('fs');
const path = require('path');

function walk(d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes('commissions') || c.includes('iframe') || c.includes('Commissions')) {
        console.log('Match in:', p);
        const lines = c.split('\n');
        lines.forEach((l, idx) => {
          if (l.toLowerCase().includes('commissions') || l.toLowerCase().includes('iframe')) {
            console.log(`  L${idx+1}: ${l.trim().substring(0, 100)}`);
          }
        });
      }
    }
  });
}

walk('./src');

const fs = require('fs'); 
let c = fs.readFileSync('src/components/DashboardView.tsx', 'utf8'); 
c = c.replace(/\} role="button"/g, ')} role="button"'); 
c = c.replace(/\}\}\} \)/g, '}}}'); 
c = c.replace(/\}\}\}\)/g, '}}}'); 
fs.writeFileSync('src/components/DashboardView.tsx', c);

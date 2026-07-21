const fs = require('fs');
const path = require('path');

function replaceBrokenChars(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      replaceBrokenChars(full);
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      if (content.includes('”¢') || content.includes('*¢')) {
        content = content.replace(/”¢/g, '•');
        content = content.replace(/\*¢/g, '•');
        fs.writeFileSync(full, content, 'utf8');
        console.log('Fixed', full);
      }
    }
  }
}
replaceBrokenChars('C:/Users/titan/Documents/Titan Diamond/Overdue Inv/SalesPortal/src');

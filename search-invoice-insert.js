const fs = require('fs');
const path = require('path');

function searchDir(dir, pattern) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
        searchDir(fullPath, pattern);
      }
    } else if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (pattern.test(content)) {
        console.log(`Match found in: ${fullPath}`);
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (pattern.test(line)) {
            console.log(`  Line ${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

console.log('Searching for "prisma.invoice" in SalesPortal...');
searchDir('c:\\Users\\titan\\Documents\\Titan Diamond\\Overdue Inv\\SalesPortal', /prisma\.invoice/i);

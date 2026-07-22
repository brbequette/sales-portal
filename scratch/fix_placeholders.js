const fs = require('fs');
const files = [
  'src/app/page.tsx',
  'src/app/tasks/new/page.tsx',
  'src/app/tasks/page.tsx'
];
files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  // Strip any non-ASCII chars from placeholder="" values
  const fixed = c.replace(/placeholder="([^"]*)"/g, (match, inner) => {
    const cleaned = inner.replace(/[^\x00-\x7F]/g, '');
    return `placeholder="${cleaned}"`;
  });
  if (fixed !== c) {
    fs.writeFileSync(f, fixed, 'utf8');
    console.log('Fixed:', f);
  }
});

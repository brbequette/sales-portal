const fs = require('fs');
const files = [
  'src/components/SalesCallCampaignModal.tsx',
  'src/components/SalesAssistant.tsx',
  'src/components/ContactsView.tsx',
  'src/components/AccountSlideout.tsx',
  'src/app/page.tsx',
  'src/app/account/page.tsx'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let c = fs.readFileSync(file, 'utf8');
  if (c.includes('"use client"') && !c.startsWith('"use client"')) {
    c = c.replace(/"use client"\n?/g, '');
    c = '"use client"\n\n' + c;
    fs.writeFileSync(file, c);
    console.log('Fixed use client in ' + file);
  }
}

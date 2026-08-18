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
  
  if (!c.includes('formatPhoneNumber')) {
    c = `import { formatPhoneNumber } from "@/lib/formatters"\n` + c;
  }

  // SalesCallCampaignModal.tsx
  c = c.replace(/>\{displayPhone\}<\/a>/g, '>{formatPhoneNumber(displayPhone)}</a>');
  
  // AccountSlideout.tsx & SalesAssistant.tsx
  c = c.replace(/\{account\.phone\}/g, '{formatPhoneNumber(account.phone)}');
  c = c.replace(/\{contact\.phone\}/g, '{formatPhoneNumber(contact.phone)}');
  c = c.replace(/\{contact\.mobilePhone\}/g, '{formatPhoneNumber(contact.mobilePhone)}');
  
  // page.tsx & account/page.tsx
  c = c.replace(/\{account\.crmDetails\.Phone\}/g, '{formatPhoneNumber(account.crmDetails.Phone)}');
  c = c.replace(/\{contact\.Phone\}/g, '{formatPhoneNumber(contact.Phone)}');
  c = c.replace(/\{contact\.Mobile\}/g, '{formatPhoneNumber(contact.Mobile)}');
  
  // ContactsView.tsx
  c = c.replace(/>\{selectedContact\.phone\}<\/a>/g, '>{formatPhoneNumber(selectedContact.phone)}</a>');
  c = c.replace(/>\{selectedContact\.mobilePhone\}<\/a>/g, '>{formatPhoneNumber(selectedContact.mobilePhone)}</a>');

  fs.writeFileSync(file, c);
  console.log('Updated ' + file);
}

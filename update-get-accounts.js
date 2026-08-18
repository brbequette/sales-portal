const fs = require('fs');
let code = fs.readFileSync('netlify/functions/get-accounts.ts', 'utf8');

// Update Account select
code = code.replace(/timeZone: true,/g, 'timeZone: true, billingStreet: true, billingCity: true, billingState: true, billingZip: true,');

// Update Contact select
code = code.replace(/phone: true, mobilePhone: true, isPrimary: true, firstName: true, lastName: true/g, 'phone: true, mobilePhone: true, isPrimary: true, firstName: true, lastName: true, mailingStreet: true, mailingCity: true, mailingState: true, mailingZip: true');

// Update Account Map Return
code = code.replace(/timeZone: acc.timeZone,/g, 'timeZone: acc.timeZone, billingStreet: acc.billingStreet, billingCity: acc.billingCity, billingState: acc.billingState, billingZip: acc.billingZip,');

// Update Account create/update
code = code.replace(/timeZone: timeZone,/g, "timeZone: timeZone, billingStreet: record.Billing_Street || null, billingCity: record.Billing_City || null, billingState: record.Billing_State || null, billingZip: record.Billing_Code || null,");

// Update Contact create/update
code = code.replace(/mobilePhone: contactRecord.Mobile \|\| null,/g, "mobilePhone: contactRecord.Mobile || null, mailingStreet: contactRecord.Mailing_Street || null, mailingCity: contactRecord.Mailing_City || null, mailingState: contactRecord.Mailing_State || null, mailingZip: contactRecord.Mailing_Zip || null,");

fs.writeFileSync('netlify/functions/get-accounts.ts', code);
console.log('Updated get-accounts.ts');

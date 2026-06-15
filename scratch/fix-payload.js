const fs = require('fs');
const path = 'netlify/functions/get-accounts.ts';
let code = fs.readFileSync(path, 'utf8');

const selectBlockStart = code.indexOf('          invoices: {');
const contactsBlockStart = code.indexOf('          contacts: {');

if (selectBlockStart !== -1 && contactsBlockStart !== -1) {
  const replacement = `          invoices: {
            where: {
              status: {
                notIn: ['Writeoff', 'Write_off', 'Write Off', 'Bad Debt', 'Void', 'Draft']
              }
            },
            select: {
              amount: true
            }
          },
`;
  code = code.substring(0, selectBlockStart) + replacement + code.substring(contactsBlockStart);

  // Now find where it returns
  // dbAccounts = await prisma.account.findMany(
  // we need to map them.
  const returnPattern = `return {
        statusCode: 200,
        body: JSON.stringify({ success: true, accounts: dbAccounts, reps: repsList })
      }`;
  
  const modifiedReturn = `
      // Prune invoices down to just a totalSales figure to massively shrink the JSON size
      const prunedAccounts = dbAccounts.map(acc => {
         const totalSales = acc.invoices ? acc.invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0) : 0;
         return {
            ...acc,
            invoices: undefined, // completely strip the invoices array to save bandwidth
            totalSales
         };
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, accounts: prunedAccounts, reps: repsList })
      }`;
  
  code = code.replace(returnPattern, modifiedReturn);
  
  fs.writeFileSync(path, code);
  console.log("Replaced successfully.");
} else {
  console.log("Could not find blocks.");
}

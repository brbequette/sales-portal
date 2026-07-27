const { handler } = require('./netlify/functions/get-commissions');

async function run() {
  console.log('Testing year=all locally...');
  const res = await handler({ queryStringParameters: { includeHidden: 'true', year: 'all' } }, {});
  console.log('Status:', res.statusCode);
  console.log('Body size:', res.body ? res.body.length : 0);
  process.exit(0);
}

run();

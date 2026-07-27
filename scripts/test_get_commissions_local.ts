import { handler } from '../netlify/functions/get-commissions';

async function run() {
  console.log('Testing year=all locally...');
  const res: any = await handler({ queryStringParameters: { includeHidden: 'true', year: 'all' } } as any, {} as any);
  console.log('Status:', res.statusCode);
  console.log('Body size:', res.body ? res.body.length : 0);
  process.exit(0);
}

run();

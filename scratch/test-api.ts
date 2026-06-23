import { handler } from './netlify/functions/get-commissions';

const event = {
  queryStringParameters: {},
  httpMethod: 'GET'
};

handler(event as any, {} as any).then((res: any) => {
  const data = JSON.parse(res.body);
  const rep = data.reps['cmppb6nye01oi13bxf3r9bv8j']; // Bobby Salyers
  if (rep) {
    const bonuses = rep.invoices.filter((i: any) => i.id.startsWith('bonus'));
    console.log("Found bonuses:", bonuses);
  } else {
    console.log("Rep not found in response");
  }
}).catch(console.error);

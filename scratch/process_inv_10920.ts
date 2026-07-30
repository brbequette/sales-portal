import { handler } from "../netlify/functions/process-invoice-costs";

async function main() {
  console.log("Re-processing Invoice 10920...");
  const result = await handler(
    {
      httpMethod: "POST",
      body: JSON.stringify({ invoiceNumber: "10920", skipLoopGuard: true }),
      headers: {},
      queryStringParameters: {},
      multiValueQueryStringParameters: {},
      path: "/api/process-invoice-costs",
      multiValueHeaders: {},
      isBase64Encoded: false,
      rawUrl: "",
      rawQuery: ""
    } as any,
    {} as any
  );
  console.log("Status Code:", result?.statusCode);
  console.log("Result Body:", JSON.stringify(JSON.parse(result?.body || "{}"), null, 2));
}

main().catch(console.error);

import { handler } from "../../../../netlify/functions/import-books-csv";
import { NextRequest, NextResponse } from "next/server";

async function executeNetlifyFunction(req: NextRequest) {
  const url = new URL(req.url);
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : null,
    isBase64Encoded: false,
  };
  const context = {};
  try {
    const result: any = await handler(event as any, context as any);
    if (!result) return new NextResponse('', { status: 200 });
    return new NextResponse(result.body || '', {
      status: result.statusCode || 200,
      headers: result.headers || { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', detail: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }

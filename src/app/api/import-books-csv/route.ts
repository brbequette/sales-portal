import { handler } from "../../../../netlify/functions/import-books-csv";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

async function executeNetlifyFunction(req: NextRequest) {
  const url = new URL(req.url);
  let bodyText: string | null = null;
  
  try {
    bodyText = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : null;
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to read request body', detail: e.message }, { status: 400 });
  }

  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: bodyText,
    isBase64Encoded: false,
  };
  const context = {};
  try {
    const result: any = await handler(event as any, context as any);
    if (!result) return NextResponse.json({ success: true });
    return new NextResponse(result.body || '{}', {
      status: result.statusCode || 200,
      headers: result.headers || { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('import-books-csv route error:', error);
    return NextResponse.json({ error: 'Internal Server Error', detail: error.message, stack: error.stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }

import { handler } from "../../../../netlify/functions/manage-media-asset";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedDbUser } from "@/lib/session-user";

async function executeNetlifyFunction(req: NextRequest) {
  const url = new URL(req.url);
  const actor = await getAuthenticatedDbUser();
  if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!actor.isAdmin) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  const requestBody = req.method !== 'GET' && req.method !== 'HEAD'
    ? { ...JSON.parse(await req.text() || '{}'), userId: actor.user.id }
    : null;
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: requestBody ? JSON.stringify(requestBody) : null,
    isBase64Encoded: false,
  };

  const context = {};

  try {
    const result: any = await handler(event as any, context as any);
    if (!result) return new NextResponse('', { status: 200 });
    
    if (result.statusCode === 302 || result.statusCode === 301) {
      const location = result.headers?.Location || result.headers?.location;
      if (location) return NextResponse.redirect(location);
    }
    return new NextResponse(result.body || '', {
      status: result.statusCode || 200,
      headers: result.headers || { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error executing manage-media-asset:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function PUT(req: NextRequest) { return executeNetlifyFunction(req); }
export async function DELETE(req: NextRequest) { return executeNetlifyFunction(req); }

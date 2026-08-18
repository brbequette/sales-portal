import { handler } from "../../../../netlify/functions/update-account-details";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAccountOwnership } from "@/lib/auth-helpers";

async function executeNetlifyFunction(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let bodyText = "";
  let accountId: string | null = null;
  
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    bodyText = await req.text();
    try {
      const parsed = JSON.parse(bodyText);
      accountId = parsed.accountId || parsed.zohoId || null;
    } catch (e) {
      // Ignored
    }
  }

  const check = await checkAccountOwnership(accountId);
  if (!check.authorized) {
    return check.errorResponse || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: bodyText || null,
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
    console.error('Error executing update-account-details:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return executeNetlifyFunction(req); }
export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function PUT(req: NextRequest) { return executeNetlifyFunction(req); }
export async function DELETE(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }

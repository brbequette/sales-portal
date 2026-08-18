import { handler as sendHandler } from "../../../../netlify/functions/email-send";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const result: any = await sendHandler(event as any, context as any);
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
    console.error('Error executing email send:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// GET: List emails (optionally filtered by accountId)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    const where: any = {};
    if (accountId) where.accountId = accountId;

    const emails = await prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ success: true, emails });
  } catch (error: any) {
    console.error('Error fetching emails:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Send an email
export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }

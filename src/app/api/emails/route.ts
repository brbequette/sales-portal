import { handler as sendHandler } from "../../../../netlify/functions/email-send";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedDbUser } from "@/lib/session-user";
import { isAdministratorRole } from "@/lib/roles";
import type { Prisma } from "@prisma/client";


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
    const auth = await getAuthenticatedDbUser();
    if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    const privileged = isAdministratorRole(auth.user.role) || auth.user.role.toUpperCase() === 'MANAGER';
    const callerId = auth.user.id;
    const ownedAccountIds = privileged
      ? []
      : (await prisma.account.findMany({ where: { ownerId: callerId }, select: { id: true } })).map(account => account.id);

    const where: Prisma.EmailWhereInput = privileged ? {} : { OR: [{ accountId: { in: ownedAccountIds } }, { userId: callerId }] };
    if (accountId) {
      const account = await prisma.account.findFirst({
        where: { OR: [{ id: accountId }, { zohoId: accountId }] },
        select: { id: true, ownerId: true },
      });
      if (!account || (!privileged && account.ownerId !== callerId)) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      where.accountId = account.id;
      delete where.OR;
    }

    const folder = searchParams.get('folder') || 'all'
    if (!['all', 'inbox', 'sent', 'archived'].includes(folder)) return NextResponse.json({ success: false, error: 'Invalid email folder' }, { status: 400 })
    if (folder === 'inbox') { where.direction = 'INBOUND'; where.status = { not: 'ARCHIVED' } }
    if (folder === 'sent') where.direction = 'OUTBOUND'
    if (folder === 'archived') where.status = 'ARCHIVED'
    const query = searchParams.get('q')?.trim().slice(0, 100)
    if (query) where.AND = [{ OR: [{ subject: { contains: query, mode: 'insensitive' } }, { body: { contains: query, mode: 'insensitive' } }, { fromAddress: { contains: query, mode: 'insensitive' } }, { toAddress: { contains: query, mode: 'insensitive' } }] }]
    const cursor = searchParams.get('cursor')
    // A cursor cannot be used to infer the position of an inaccessible message.
    if (cursor && !await prisma.email.findFirst({ where: { AND: [where, { id: cursor }] }, select: { id: true } })) return NextResponse.json({ error: 'Invalid email page.' }, { status: 400 })
    const emails = await prisma.email.findMany({
      where,
      orderBy: [{ receivedAt: { sort: 'desc', nulls: 'last' } }, { sentAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { operationalEvents: { where: { eventType: 'CUSTOMER_FOLLOW_UP', status: { in: ['REVIEW_REQUIRED', 'APPROVED'] } }, select: { id: true }, take: 1 } },
    });

    return NextResponse.json({ success: true, emails: emails.slice(0, 50).map(({ operationalEvents, ...email }) => ({ ...email, intelligenceNeedsResponse: email.direction === 'INBOUND' && email.status !== 'REPLIED' && email.status !== 'ARCHIVED' && operationalEvents.length > 0 })), nextCursor: emails.length > 50 ? emails[49].id : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    console.error('Error fetching emails:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Send an email
export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }

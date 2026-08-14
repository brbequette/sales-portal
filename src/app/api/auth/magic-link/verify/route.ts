import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCustomerToken } from '@/lib/customer-auth';

export async function POST(request: NextRequest) {
  try {
    const { contact, code } = await request.json();
    if (!contact || !code) {
      return NextResponse.json({ success: false, error: 'Contact and code are required' }, { status: 400 });
    }

    // Find valid token
    const token = await prisma.magicLinkToken.findFirst({
      where: {
        contact,
        code,
        expiresAt: { gt: new Date() },
        usedAt: null
      }
    });

    if (!token) {
      return NextResponse.json({ success: false, error: 'Invalid or expired code' }, { status: 401 });
    }

    // Mark token as used
    await prisma.magicLinkToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() }
    });

    let accountDetails = null;
    let name = null;
    let email = token.contact.includes('@') ? token.contact : null;
    let phone = !token.contact.includes('@') ? token.contact : null;

    if (token.accountId) {
      const account = await prisma.account.findUnique({
        where: { id: token.accountId },
        select: { id: true, name: true }
      });
      if (account) {
        accountDetails = { accountId: account.id, name: account.name };
        name = account.name;
      }
    }

    if (token.contactId) {
      const contactRecord = await prisma.contact.findUnique({
        where: { id: token.contactId },
        select: { firstName: true, lastName: true, email: true, phone: true }
      });
      if (contactRecord) {
        name = `${contactRecord.firstName || ''} ${contactRecord.lastName || ''}`.trim() || name;
        email = contactRecord.email || email;
        phone = contactRecord.phone || phone;
      }
    }

    const jwt = await createCustomerToken({
      accountId: token.accountId,
      contactId: token.contactId,
      name,
      email,
      phone
    });

    return NextResponse.json({ 
      success: true, 
      token: jwt, 
      customer: {
        accountId: token.accountId,
        contactId: token.contactId,
        name,
        email,
        phone
      }
    });
  } catch (error: any) {
    console.error('Magic link verify error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

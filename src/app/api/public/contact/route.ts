import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, company, email, phone, message } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const nameParts = (name || '').trim().split(' ');
    const firstName = nameParts[0] || name;
    const lastName = nameParts.slice(1).join(' ') || '';

    try {
      await prisma.lead.create({
        data: {
          zohoId: `WEB-${Date.now()}`,
          company: company || name,
          firstName: firstName,
          lastName: lastName,
          email: email,
          phone: phone || '',
          status: 'New Inquiry',
          ownerId: 'system',
          materialsCut: message || 'Submitted website quote request',
        }
      });
    } catch (dbError) {
      console.warn("Prisma lead creation warning:", dbError);
    }

    return NextResponse.json({ success: true, message: 'Message received! Our direct sales team will contact you shortly.' });
  } catch (error: any) {
    console.error("Public contact API error:", error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMagicCode } from '@/lib/customer-auth';

export async function POST(request: NextRequest) {
  try {
    const { contact } = await request.json();
    if (!contact) {
      return NextResponse.json({ success: false, error: 'Contact is required' }, { status: 400 });
    }

    // Determine if email or phone
    const isEmail = contact.includes('@');
    
    // Look up contact in DB
    let foundContact;
    if (isEmail) {
      foundContact = await prisma.contact.findFirst({
        where: { email: { equals: contact, mode: 'insensitive' } }
      });
    } else {
      // Normalize phone number for search (e.g. remove non-digits)
      // For now, doing a basic search
      foundContact = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: { contains: contact } },
            { mobilePhone: { contains: contact } }
          ]
        }
      });
    }

    const code = generateMagicCode();
    
    // Save token to DB with 15 min expiry
    await prisma.magicLinkToken.create({
      data: {
        contact,
        code,
        accountId: foundContact?.accountId || null,
        contactId: foundContact?.id || null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 mins
      }
    });

    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host');
    const baseUrl = `${protocol}://${host}`;

    if (isEmail) {
      // Send email via zoho-voice API or other means
      // The instructions say: "If contact looks like email (contains @), send code via internal fetch to /api/zoho-voice with action SEND_EMAIL... Actually, for simplicity: use fetch to the existing zoho-voice API. For email, just use a simple approach - construct and send a verification email."
      
      // I'll use the zoho-voice API since it's mentioned.
      await fetch(`${baseUrl}/api/zoho-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_EMAIL',
          to: contact,
          subject: 'Your Titan Diamond Customer Portal Login Code',
          content: `<p>Your login code is: <strong>${code}</strong></p><p>This code will expire in 15 minutes.</p>`
        })
      }).catch(err => console.error('Failed to send email:', err));
    } else {
      // Send SMS
      await fetch(`${baseUrl}/api/zoho-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_SMS',
          to: contact,
          noteContent: `Your Titan Diamond login code is: ${code}`
        })
      }).catch(err => console.error('Failed to send SMS:', err));
    }

    return NextResponse.json({ success: true, message: 'Code sent' });
  } catch (error: any) {
    console.error('Magic link error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

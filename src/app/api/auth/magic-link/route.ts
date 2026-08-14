import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMagicCode } from '@/lib/customer-auth';
import { getZohoAccessToken, ZOHO_DC } from '@/lib/zoho-auth';

const ZOHO_MAIL_ACCOUNT_ID = "6682814000000008002";
const FROM_EMAIL = "ben@titandiamondusa.com";

async function sendOtpEmail(toAddress: string, code: string): Promise<void> {
  const token = await getZohoAccessToken();
  const res = await fetch(
    `https://mail.zoho.${ZOHO_DC}/api/accounts/${ZOHO_MAIL_ACCOUNT_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        fromAddress: FROM_EMAIL,
        toAddress,
        subject: 'Your Titan Diamond Customer Portal Login Code',
        content: `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1a1a1a; margin-bottom: 24px;">Customer Portal Login</h2>
          <p style="color: #444; font-size: 16px;">Your verification code is:</p>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 15 minutes. If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">Titan Diamond USA</p>
        </div>`,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoho Mail error ${res.status}: ${body}`);
  }
}

async function sendOtpSms(phoneNumber: string, code: string): Promise<void> {
  // Normalize to E.164
  let normalized = phoneNumber.replace(/[^\d+]/g, '');
  if (normalized.length === 10 && !normalized.startsWith('+')) {
    normalized = '+1' + normalized;
  } else if (!normalized.startsWith('+') && normalized.length > 10) {
    normalized = '+' + normalized;
  }

  const token = await getZohoAccessToken();
  const fromNumber = process.env.ZOHO_VOICE_FROM_NUMBER || '+14804702577';

  const formData = new FormData();
  formData.append('sms_data', JSON.stringify({
    customerNumber: normalized,
    message: `Your Titan Diamond login code is: ${code}. Expires in 15 min.`,
    senderId: fromNumber,
    mms: false,
  }));

  const res = await fetch(
    `https://voice.zoho.${ZOHO_DC}/rest/json/v2/sms/send`,
    {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` },
      signal: AbortSignal.timeout(15000),
      body: formData,
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoho Voice SMS error ${res.status}: ${body}`);
  }
}

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
      const digits = contact.replace(/\D/g, '');
      foundContact = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: { contains: digits } },
            { mobilePhone: { contains: digits } }
          ]
        }
      });
    }

    if (!foundContact?.accountId) {
      // Don't reveal whether the contact exists — still return success
      return NextResponse.json({ success: true, message: 'If an account exists, a code has been sent.' });
    }

    const code = generateMagicCode();
    
    // Save token to DB with 15 min expiry
    await prisma.magicLinkToken.create({
      data: {
        contact,
        code,
        accountId: foundContact.accountId,
        contactId: foundContact.id,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 mins
      }
    });

    // Send the code via the appropriate channel
    try {
      if (isEmail) {
        await sendOtpEmail(contact, code);
      } else {
        await sendOtpSms(contact, code);
      }
    } catch (sendError) {
      console.error('Failed to send OTP:', sendError);
      // Still return success to not leak info, but log the failure
      return NextResponse.json({ success: true, message: 'If an account exists, a code has been sent.' });
    }

    return NextResponse.json({ success: true, message: 'If an account exists, a code has been sent.' });
  } catch (error: any) {
    console.error('Magic link error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

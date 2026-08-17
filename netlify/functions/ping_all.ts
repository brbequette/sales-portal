import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Canonical robust .env file parser
try {
  const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    let val = trimmed.substring(eqIndex + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    process.env[key] = val;
  }
} catch (e) {}

const TARGET_EMAIL = 'ben@titandiamond.net';
const TEST_ACCOUNT_EMAIL = 'brbequette@gmail.com';
const TARGET_PHONE = '+16183355304';
const ZOHO_DC = process.env.ZOHO_DC || 'com';

const prisma = new PrismaClient();

// Setup email transport
const mailTransport = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

async function runPingAll() {
  console.log('📡 STARTING ALL-CHANNELS SYSTEM PING INJECTOR...');
  
  // ==================== CHANNEL 1: EMAIL ====================
  console.log(`\n📧 Sending test emails to ${TARGET_EMAIL} and ${TEST_ACCOUNT_EMAIL}...`);
  try {
    await mailTransport.sendMail({
      from: `"Titan Diamond Gateway" <${process.env.SMTP_USER}>`,
      to: `${TARGET_EMAIL}, ${TEST_ACCOUNT_EMAIL}`,
      subject: '⚡ ANTIGRAVITY: Zoho SMTP Gateway Online',
      text: 'If you receive this document, your production notification plumbing is officially active.'
    });
    console.log('✅ Emails sent successfully!');
  } catch (err: any) {
    console.error('❌ Email failed:', err.message);
  }

  // ==================== CHANNEL 2: IN-APP ====================
  console.log(`\n🔔 Sending in-app notification to active user: ${TARGET_EMAIL}...`);
  try {
    let user = await prisma.user.findFirst({
      where: { email: { equals: TARGET_EMAIL, mode: 'insensitive' } }
    });

    if (!user) {
      console.log(`   -> Active user ${TARGET_EMAIL} not found. Creating one now...`);
      user = await prisma.user.create({
        data: {
          email: TARGET_EMAIL,
          name: 'Ben',
          role: 'ADMIN'
        }
      });
    }

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        title: '⚡ ANTIGRAVITY: In-App System Notification',
        body: 'This notification verifies that your in-app channel is fully active.',
        url: '/rep-portal'
      }
    });
    console.log(`✅ In-app notification stored in database under User ID: ${user.id}`);
  } catch (err: any) {
    console.error('❌ In-app notification failed:', err.message);
  }

  // ==================== CHANNEL 3: SMS TEXT ====================
  console.log(`\n💬 Sending SMS text message to ${TARGET_PHONE}...`);
  try {
    if (!process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET) {
      throw new Error('Zoho OAuth credentials missing in env.');
    }

    // Refresh Zoho token
    const tokenParams = new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id:     process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type:    'refresh_token',
    });

    const tokenRes = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    tokenParams.toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(`Token refresh failed: ${JSON.stringify(tokenData)}`);
    }

    const token = tokenData.access_token;
    
    // Sanitize fromNumber
    let rawFromNumber = process.env.ZOHO_VOICE_FROM_NUMBER || '+14804702577';
    const fromNumber = rawFromNumber.replace(/[^+\d]/g, '');

    const formData = new FormData();
    formData.append('sms_data', JSON.stringify({
      customerNumber: TARGET_PHONE,
      message: `Your ${process.env.COMPANY_NAME || 'Titan Diamond'} login code is: 554321. Expires in 15 min.`,
      senderId: fromNumber,
      mms: false,
    }));

    const res = await fetch(
      `https://voice.zoho.${ZOHO_DC}/rest/json/v2/sms/send`,
      {
        method: 'POST',
        headers: { 'Authorization': `Zoho-oauthtoken ${token}` },
        body: formData,
      }
    );

    if (res.ok) {
      console.log('✅ SMS text message sent successfully via Zoho Voice!');
    } else {
      const errorBody = await res.text();
      console.error(`❌ Zoho Voice SMS rejection: ${res.status} - ${errorBody}`);
    }
  } catch (err: any) {
    console.error('❌ SMS failed:', err.message);
  }

  console.log('\n=============================================');
  console.log('🎉 ALL-CHANNELS PING ATTEMPT COMPLETED! 🎉');
  console.log('=============================================');
}

runPingAll().then(() => prisma.$disconnect());

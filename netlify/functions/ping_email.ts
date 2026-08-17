import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

// Read SMTP credentials from .env file manually to avoid dotenv dependency
try {
  const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
  const userMatch = envContent.match(/SMTP_USER\s*=\s*["']?([^"'\s]+)["']?/);
  const passMatch = envContent.match(/SMTP_PASSWORD\s*=\s*["']?([^"'\s]+)["']?/);
  if (userMatch) process.env.SMTP_USER = userMatch[1];
  if (passMatch) process.env.SMTP_PASSWORD = passMatch[1];
} catch (e) {}

// Configuration explicit for Zoho Mail Secure SSL channels
const mailTransport = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true, // Required for Zoho port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

async function runDirectZohoSmtpPing() {
  console.log('📡 Dispatching direct SMTP verification request to Zoho Mail relays...');
  try {
    await mailTransport.sendMail({
      from: `"Titan Diamond Gateway" <${process.env.SMTP_USER}>`,
      to: 'brbequette@gmail.com',
      subject: '⚡ ANTIGRAVITY: Zoho SMTP Gateway Online',
      text: 'If you receive this document, your production notification plumbing is officially active.'
    });
    console.log('✅ Success! The test email has been accepted by the Zoho mail relay.');
  } catch (err: any) {
    console.error('❌ SMTP Authentication Fault Detected:', err.message);
  }
}

runDirectZohoSmtpPing();

import { Handler } from "@netlify/functions";
import nodemailer from "nodemailer";

const API_LOGIN_ID = process.env.AUTHORIZENET_API_LOGIN_ID;
const TRANSACTION_KEY = process.env.AUTHORIZENET_TRANSACTION_KEY;
const ENV = process.env.AUTHORIZENET_ENV || 'production';
const ANET_URL = ENV === 'sandbox' ? 'https://apitest.authorize.net/xml/v1/request.api' : 'https://api.authorize.net/xml/v1/request.api';

// 1. Initialize secure SMTP network delivery channel
const mailTransport = nodemailer.createTransport({
  host: process.env.SMTP_SERVER || '://gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,       // System sending address parsed from local .env
    pass: process.env.SMTP_PASSWORD    // Secure authentication app password
  }
});

export const handler: Handler = async (event) => {
  const allowedOrigin = process.env.URL || process.env.SITE_URL || "*";
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  let body: any = {}
  try {
    body = JSON.parse(event.body || "{}")
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { opaqueDataDescriptor, opaqueDataValue, amount, invoiceId, invoiceNumber, customerName } = body;

  if (!opaqueDataDescriptor || !opaqueDataValue || !amount) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing required payment fields' }) }
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount >= 100000) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid amount. Must be a positive number less than 100,000.' }) }
  }

  const amountStr = parseFloat(amount).toFixed(2);

  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: API_LOGIN_ID,
        transactionKey: TRANSACTION_KEY,
      },
      refId: invoiceId || 'N/A',
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: amountStr,
        payment: {
          opaqueData: {
            dataDescriptor: opaqueDataDescriptor,
            dataValue: opaqueDataValue,
          },
        },
        order: {
          invoiceNumber: invoiceNumber || invoiceId || '',
          description: `Payment for Invoice ${invoiceNumber || invoiceId} - ${customerName || ''}`,
        },
        customerIP: event.headers['client-ip'] || event.headers['x-forwarded-for'] || '',
      },
    },
  };

  try {
    const res = await fetch(ANET_URL, {
      signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data: any = await res.json();
    const txResult = data.transactionResponse;

    if (!txResult) {
      throw new Error(data.messages?.message?.[0]?.text || 'No transaction response');
    }

    const resultCode = data.messages?.resultCode;
    const responseCode = txResult.responseCode;
    const authCode = txResult.authCode || '';
    const transId = txResult.transId || '';
    const avsResult = txResult.avsResultCode || '';
    const errorText = txResult.errors?.[0]?.errorText || data.messages?.message?.[0]?.text || '';

    if (resultCode === 'Ok' && responseCode === '1') {
      // 2. INJECTED REAL-TIME OUTBOUND NOTIFICATION PIPELINE
      const targetEmail = 'brbequette@gmail.com';
      console.log(`🚀 PAYMENT STATUS SUCCESS: Broadcasting instant transaction alert to: ${targetEmail}`);

      try {
        await mailTransport.sendMail({
          from: `"Titan Diamond Gateway" <${process.env.SMTP_USER}>`,
          to: targetEmail,
          subject: `🔥 PRODUCTION ALERT: Merchant Payment Settled ($${amountStr})`,
          html: `
            <div style="font-family: sans-serif; padding: 25px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px; margin: auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
              <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-top: 0;">🎉 Live Transaction Handshake Complete</h2>
              <p><strong>Customer Target Account:</strong> ${customerName || 'BEN TEST ACCOUNT'}</p>
              <p><strong>Invoice Identifier:</strong> #${invoiceNumber || invoiceId || 'N/A'}</p>
              <p><strong>Authorize.Net Transaction ID:</strong> ${transId}</p>
              <p><strong>Authorized Amount:</strong> <span style="font-size: 18px; color: #1e3a8a; font-weight: bold;">$${amountStr} USD</span></p>
              
              <div style="background-color: #eff6ff; padding: 15px; border-left: 4px solid #3b82f6; border-radius: 4px; margin-top: 20px;">
                <p style="margin: 0; font-weight: bold; color: #1e40af;">📣 Outbound Telemetry Confirmation</p>
                <p style="margin: 5px 0 0 0; color: #1e3a8a; font-size: 14px;">If you see this document in your inbox, your serverless communication plumbing is officially 100% active and working in real time.</p>
              </div>
              <br />
              <p style="font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 15px;">Automated infrastructure health monitoring payload broadcasted by Antigravity Core.</p>
            </div>
          `
        });
        console.log('   ✅ Outbound verification email successfully accepted by SMTP server relay.');
      } catch (emailError: any) {
        console.error('   ❌ Critical fail inside outbound email dispatch routine:', emailError.message);
      }

      // Return original client response format natively
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          success: true,
          transId,
          authCode,
          avsResult,
          amount: amountStr,
          last4: txResult.accountNumber?.replace(/X/g, '').trim() || '',
          cardType: txResult.accountType || '',
        }),
      };
    } else {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: false, transId, errorText, responseCode }),
      };
    }
  } catch (err: any) {
    console.error('authorize-charge error:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

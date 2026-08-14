import { Handler } from "@netlify/functions"

const API_LOGIN_ID = process.env.AUTHORIZENET_API_LOGIN_ID;
const TRANSACTION_KEY = process.env.AUTHORIZENET_TRANSACTION_KEY;
const ENV = process.env.AUTHORIZENET_ENV || 'production';

const ANET_URL = ENV === 'sandbox'
  ? 'https://apitest.authorize.net/xml/v1/request.api'
  : 'https://api.authorize.net/xml/v1/request.api';

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
    const res = await fetch(ANET_URL, { signal: AbortSignal.timeout(15000),
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
      // Approved
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
        body: JSON.stringify({
          success: false,
          transId,
          errorText,
          responseCode,
        }),
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

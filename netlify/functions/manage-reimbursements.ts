import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const handler = async (event: any) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Successful preflight call.' }),
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const { userId } = event.queryStringParameters || {};
      const reimbursements = await prisma.reimbursement.findMany({
        where: userId ? { userId } : undefined,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: reimbursements }),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { userId, amount, description, receiptUrl, status, dateSubmitted } = body;
      
      const reimbursement = await prisma.reimbursement.create({
        data: {
          userId,
          amount: parseFloat(amount),
          description,
          receiptUrl,
          status: status || 'PENDING',
          dateSubmitted: dateSubmitted ? new Date(dateSubmitted) : new Date(),
        },
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: reimbursement }),
      };
    }

    if (event.httpMethod === 'PATCH' || event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { id, status } = body;
      
      const reimbursement = await prisma.reimbursement.update({
        where: { id },
        data: { status },
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: reimbursement }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  } catch (error: any) {
    console.error('Error managing reimbursements:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

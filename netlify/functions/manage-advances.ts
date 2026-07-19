import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const handler = async (event: any) => {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      const advances = await prisma.advance.findMany({
        where: userId ? { userId } : undefined,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: advances }),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { userId, amount, reason, issueDate, splitOverWeeks, deductionRate } = body;
      
      const advance = await prisma.advance.create({
        data: {
          userId,
          amount: parseFloat(amount),
          reason,
          issueDate: issueDate ? new Date(issueDate) : new Date(),
          splitOverWeeks: splitOverWeeks ? parseInt(splitOverWeeks, 10) : undefined,
          deductionRate: deductionRate ? parseFloat(deductionRate) : undefined,
        },
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: advance }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  } catch (error: any) {
    console.error('Error managing advances:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

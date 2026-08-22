
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

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

  let authenticatedUser
  try {
    authenticatedUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, headers)
  }

  const isAdmin = authenticatedUser.role === 'ADMIN' || authenticatedUser.role === 'Administrator'

  try {
    if (event.httpMethod === 'GET') {
      const { userId } = event.queryStringParameters || {};
      if (!isAdmin && userId && userId !== authenticatedUser.dbId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      }
      const effectiveUserId = isAdmin ? userId : authenticatedUser.dbId;
      const advances = await prisma.advance.findMany({
        where: effectiveUserId ? { userId: effectiveUserId } : undefined,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: advances }),
      };
    }

    if (event.httpMethod === 'POST') {
      if (!isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Administrator access required' }) };
      }
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

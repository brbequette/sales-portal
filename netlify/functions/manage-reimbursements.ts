
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

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
      const reimbursements = await prisma.reimbursement.findMany({
        where: effectiveUserId ? { userId: effectiveUserId } : undefined,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: reimbursements }),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { amount, description, receiptUrl, dateSubmitted } = body;
      const userId = isAdmin ? body.userId : authenticatedUser.dbId;
      const status = isAdmin ? (body.status || 'PENDING') : 'PENDING';
      
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
      if (!isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Administrator access required' }) };
      }
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

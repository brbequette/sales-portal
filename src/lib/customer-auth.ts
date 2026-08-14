import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

const SECRET_KEY = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback_secret_key_for_dev_only'
);

export interface CustomerJwtPayload {
  accountId: string | null;
  contactId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  [key: string]: any;
}

export async function createCustomerToken(payload: CustomerJwtPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET_KEY);
  
  return token;
}

export async function verifyCustomerToken(request: NextRequest): Promise<CustomerJwtPayload | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload as unknown as CustomerJwtPayload;
  } catch (error) {
    console.error('Customer token verification failed:', error);
    return null;
  }
}

export function generateMagicCode() {
  return crypto.randomInt(100000, 999999).toString();
}

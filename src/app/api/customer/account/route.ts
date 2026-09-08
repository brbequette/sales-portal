import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken } from '@/lib/customer-auth';
import { getZohoAccessToken, ZOHO_DC } from '@/lib/zoho-auth';

export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findUnique({
      where: { id: customer.accountId },
      select: {
        id: true,
        name: true,
        quality: true,
        billingStreet: true,
        billingCity: true,
        billingState: true,
        billingZip: true,
        shippingStreet: true,
        shippingCity: true,
        shippingState: true,
        shippingZip: true,
        owner: {
          select: {
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: account });
  } catch (error: any) {
    console.error('Customer account error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer?.accountId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const account = await prisma.account.findUnique({ where: { id: customer.accountId }, include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } });
    if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

    const primary = account.contacts.find((contact) => contact.id === customer.contactId) || account.contacts[0];
    const accountData = {
      name: clean(body.name, 160) || account.name,
      billingStreet: clean(body.billingStreet, 180), billingCity: clean(body.billingCity, 100), billingState: clean(body.billingState, 80), billingZip: clean(body.billingZip, 20),
      shippingStreet: clean(body.shippingStreet, 180), shippingCity: clean(body.shippingCity, 100), shippingState: clean(body.shippingState, 80), shippingZip: clean(body.shippingZip, 20),
    };
    const contactData = { firstName: clean(body.firstName, 80), lastName: clean(body.lastName, 80), email: clean(body.email, 254).toLowerCase(), phone: clean(body.phone, 40), mobilePhone: clean(body.mobilePhone, 40) };
    if (contactData.email && !/^\S+@\S+\.\S+$/.test(contactData.email)) return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });

    const token = await getZohoAccessToken();
    const headers = { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' };
    const crmAccount = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${account.zohoId}`, {
      method: 'PUT', headers, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ data: [{ Account_Name: accountData.name, Billing_Street: accountData.billingStreet, Billing_City: accountData.billingCity, Billing_State: accountData.billingState, Billing_Code: accountData.billingZip, Shipping_Street: accountData.shippingStreet, Shipping_City: accountData.shippingCity, Shipping_State: accountData.shippingState, Shipping_Code: accountData.shippingZip }] })
    });
    const accountResult = await crmAccount.json();
    if (!crmAccount.ok || accountResult?.data?.[0]?.code !== 'SUCCESS') throw new Error(accountResult?.data?.[0]?.message || 'Zoho rejected the account update.');

    if (primary?.zohoId && !primary.zohoId.startsWith('mock-')) {
      const crmContact = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/${primary.zohoId}`, {
        method: 'PUT', headers, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ data: [{ First_Name: contactData.firstName, Last_Name: contactData.lastName || '-', Email: contactData.email || null, Phone: contactData.phone || null, Mobile: contactData.mobilePhone || null }] })
      });
      const contactResult = await crmContact.json();
      if (!crmContact.ok || contactResult?.data?.[0]?.code !== 'SUCCESS') throw new Error(contactResult?.data?.[0]?.message || 'Zoho rejected the contact update.');
    }

    await prisma.$transaction([prisma.account.update({ where: { id: account.id }, data: accountData }), ...(primary ? [prisma.contact.update({ where: { id: primary.id }, data: contactData })] : [])]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Customer account update error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to update account.' }, { status: 500 });
  }
}

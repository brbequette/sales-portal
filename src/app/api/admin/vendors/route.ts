import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from '../../../../../netlify/functions/lib/zoho-auth'

const ORG_ID = ZOHO_ORGANIZATION_ID
export async function GET() {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { contactName: 'asc' }
    })
    return NextResponse.json({ success: true, vendors })
  } catch (error: any) {
    console.error('Fetch Vendors Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Create in Zoho
    const token = await getZohoAccessToken()
    const res = await fetch(`https://www.zohoapis.com/books/v3/contacts?organization_id=${ORG_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contact_type: 'vendor',
        contact_name: body.contactName,
        company_name: body.companyName,
        email: body.email,
        phone: body.phone,
        billing_address: body.billingAddress,
        shipping_address: body.shippingAddress
      })
    })

    const data = await res.json()
    if (data.code !== 0) throw new Error(data.message)
    
    const vendor = data.contact

    // Create in local DB
    const newVendor = await prisma.vendor.create({
      data: {
        zohoId: vendor.contact_id,
        contactName: vendor.contact_name,
        companyName: vendor.company_name,
        email: vendor.email,
        phone: vendor.phone,
        currencyId: vendor.currency_id,
        paymentTerms: vendor.payment_terms,
        billingAddress: vendor.billing_address,
        shippingAddress: vendor.shipping_address,
        customFields: vendor.custom_fields,
        status: vendor.status
      }
    })

    return NextResponse.json({ success: true, vendor: newVendor })
  } catch (error: any) {
    console.error('Create Vendor Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

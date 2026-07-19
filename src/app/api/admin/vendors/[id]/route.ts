import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '../../../../../../netlify/functions/lib/zoho-auth'

const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { id } = params
    
    // Find the vendor locally to get its zohoId
    const vendor = await prisma.vendor.findUnique({ where: { id } })
    if (!vendor) throw new Error("Vendor not found")

    // Update in Zoho
    const token = await getZohoAccessToken()
    const res = await fetch(`https://www.zohoapis.com/books/v3/contacts/${vendor.zohoId}?organization_id=${ORG_ID}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
    
    const zVendor = data.contact

    // Update locally
    const updatedVendor = await prisma.vendor.update({
      where: { id },
      data: {
        contactName: zVendor.contact_name,
        companyName: zVendor.company_name,
        email: zVendor.email,
        phone: zVendor.phone,
        currencyId: zVendor.currency_id,
        paymentTerms: zVendor.payment_terms,
        billingAddress: zVendor.billing_address,
        shippingAddress: zVendor.shipping_address,
        customFields: zVendor.custom_fields,
        status: zVendor.status
      }
    })

    return NextResponse.json({ success: true, vendor: updatedVendor })
  } catch (error: any) {
    console.error('Update Vendor Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

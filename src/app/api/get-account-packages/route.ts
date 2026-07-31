import { NextResponse } from 'next/server'
import { getZohoAccessToken } from '../../../../netlify/functions/lib/zoho-auth'
import { checkAccountOwnership } from '@/lib/auth-helpers'

const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      return NextResponse.json({ success: false, error: 'Missing accountId' }, { status: 400 })
    }

    const check = await checkAccountOwnership(accountId)
    if (!check.authorized) {
      return check.errorResponse || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const token = await getZohoAccessToken()
    
    // Fetch packages for this customer. Zoho Inventory API has /packages?customer_id=
    // Zoho Books handles it similarly for Sales Orders -> Packages, or we can fetch /packages directly.
    const res = await fetch(`https://www.zohoapis.com/inventory/v1/packages?customer_id=${accountId}&organization_id=${ORG_ID}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`
      }
    })

    const data = await res.json()

    if (data.code !== 0) {
      return NextResponse.json({ success: false, error: data.message })
    }

    return NextResponse.json({ success: true, packages: data.packages || [] })
  } catch (error: any) {
    console.error('Failed to fetch packages:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

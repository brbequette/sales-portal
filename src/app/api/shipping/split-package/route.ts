import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from '@/lib/zoho-auth'
import { requireAdministrator } from '@/lib/auth-helpers'

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const {
      packageId,
      packageZohoId,
      salesOrderZohoId,
      salesOrderNumber,
      box1Items,
      box2Items,
    } = body

    if (!packageId && !packageZohoId) {
      return NextResponse.json({ success: false, error: 'Package ID is required' }, { status: 400 })
    }

    const originalPkg = await prisma.package.findFirst({
      where: {
        OR: [
          packageId ? { id: packageId } : undefined,
          packageZohoId ? { zohoId: packageZohoId } : undefined,
        ].filter(Boolean) as any
      }
    })

    if (!originalPkg) {
      return NextResponse.json({ success: false, error: 'Original package not found' }, { status: 404 })
    }

    let newZohoPackageId: string | null = null
    let newPackageNumber: string | null = null

    // 1. Try to create the second package in Zoho Books if connected
    if (salesOrderZohoId && Array.isArray(box2Items) && box2Items.length > 0) {
      try {
        const token = await getZohoAccessToken()
        const ZOHO_DC = process.env.ZOHO_DC || 'com'
        const orgId = ZOHO_ORGANIZATION_ID

        const zohoLineItems = box2Items
          .filter(it => it.line_item_id || it.so_line_item_id)
          .map(it => ({
            so_line_item_id: it.line_item_id || it.so_line_item_id,
            quantity: parseInt(it.quantity) || 1
          }))

        if (zohoLineItems.length > 0) {
          const zohoRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/packages?salesorder_id=${salesOrderZohoId}&organization_id=${orgId}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                date: new Date().toISOString().split('T')[0],
                line_items: zohoLineItems,
                notes: `Split from package ${originalPkg.packageNumber || ''} to optimize shipping rates`
              })
            }
          )

          if (zohoRes.ok) {
            const zohoData = await zohoRes.json()
            if (zohoData.package) {
              newZohoPackageId = zohoData.package.package_id
              newPackageNumber = zohoData.package.package_number
              console.log(`[split-package] Created package in Zoho: ${newPackageNumber} (${newZohoPackageId})`)
            }
          } else {
            const errText = await zohoRes.text().catch(() => '')
            console.warn('[split-package] Zoho package creation returned non-200:', zohoRes.status, errText.substring(0, 300))
          }
        }
      } catch (zohoErr) {
        console.warn('[split-package] Zoho package creation error (falling back to local):', zohoErr)
      }
    }

    // Fallback package number if Zoho wasn't able to create it
    if (!newPackageNumber) {
      const origNum = originalPkg.packageNumber || 'PKG'
      newPackageNumber = `${origNum}-2`
    }
    if (!newZohoPackageId) {
      newZohoPackageId = `local_split_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    }

    // 2. Update original package in DB with Box 1 items
    const origStoredItems = (originalPkg.items as any) || {}
    const updatedOrigPkg = await prisma.package.update({
      where: { id: originalPkg.id },
      data: {
        items: {
          ...origStoredItems,
          lineItems: box1Items || origStoredItems.lineItems,
          splitWith: newPackageNumber,
          splitAt: new Date().toISOString()
        }
      }
    })

    // 3. Create second package in DB with Box 2 items
    const createdSecondPkg = await prisma.package.create({
      data: {
        zohoId: newZohoPackageId,
        packageNumber: newPackageNumber,
        salesOrderId: originalPkg.salesOrderId || salesOrderZohoId,
        salesOrderNumber: originalPkg.salesOrderNumber || salesOrderNumber,
        status: 'not_shipped',
        shippingCharge: 0,
        carrier: originalPkg.carrier || null,
        items: {
          lineItems: box2Items,
          splitFrom: originalPkg.packageNumber,
          splitAt: new Date().toISOString()
        }
      }
    })

    return NextResponse.json({
      success: true,
      originalPackage: updatedOrigPkg,
      newPackage: createdSecondPkg,
      message: `Successfully split into ${originalPkg.packageNumber} and ${newPackageNumber}`
    })

  } catch (error: any) {
    console.error('Split package error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to split package' },
      { status: 500 }
    )
  }
}

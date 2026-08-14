import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"
const ORG_ID = ZOHO_ORGANIZATION_ID
import { getSystemSettings } from "./lib/settings"

import { prisma } from "./lib/prisma"
const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;
const ZOHO_DC = process.env.ZOHO_DC || 'com';

function getCountryCode(country: string | null | undefined): string {
  if (!country) return "US";
  const c = country.trim().toUpperCase();
  if (c === "UNITED STATES" || c === "USA" || c === "US" || c === "UNITED STATES OF AMERICA") return "US";
  if (c === "CANADA" || c === "CA") return "CA";
  if (c === "UNITED KINGDOM" || c === "UK" || c === "GB") return "GB";
  return c.length === 2 ? c : "US";
}

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  const settings = await getSystemSettings(prisma)

  if (!EASYSHIP_API_KEY) {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ error: 'EASYSHIP_API_KEY environment variable is not configured.' })
    }
  }

  let body: any = {}
  try {
    body = JSON.parse(event.body || "{}")
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { invoiceId, reason } = body

  if (!invoiceId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing invoiceId' }) }
  }

  try {
    let booksInvoiceId = invoiceId

    // Try finding in database to resolve booksInvoiceId
    const dbInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { id: invoiceId },
          { zohoId: invoiceId }
        ]
      }
    })

    if (dbInvoice) {
      const items = dbInvoice.items as any
      if (items?.booksInvoiceId) {
        booksInvoiceId = items.booksInvoiceId
      }
    }

    // 1. Fetch invoice details from Zoho Books
    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    const zohoRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!zohoRes.ok) {
      const errorText = await zohoRes.text()
      throw new Error(`Zoho API failed: ${errorText}`)
    }

    const zohoData: any = await zohoRes.json()
    if (zohoData.code !== 0) {
      throw new Error(`Zoho returned error: ${zohoData.message}`)
    }

    const invoice = zohoData.invoice
    if (!invoice) {
      throw new Error('Invoice details not found in Zoho response.')
    }

    const shipping = invoice.shipping_address || {}
    const billing = invoice.billing_address || {}

    const origin = {
      line_1: shipping.address || billing.address || "123 Customer St",
      line_2: shipping.street2 || billing.street2 || "",
      city: shipping.city || billing.city || "New York",
      state: shipping.state || billing.state || "NY",
      postal_code: shipping.zip || billing.zip || "10001",
      country_alpha2: getCountryCode(shipping.country || billing.country || "US"),
      contact_name: invoice.customer_name || "Customer",
      company_name: invoice.customer_name || "Customer Company",
      phone: shipping.phone || billing.phone || invoice.phone || "555-555-5555",
      email: invoice.email || "customer@example.com"
    }

    // 2. Map line items
    const items = (invoice.line_items || []).map((item: any) => ({
      description: item.name || "Return Item",
      category: "returns",
      sku: item.sku || "RETURN",
      quantity: item.quantity || 1,
      actual_weight: settings.default_shipping_weight,
      declared_currency: invoice.currency_code || "USD",
      declared_customs_value: item.rate || 0
    }))

    if (items.length === 0) {
      items.push({
        description: `Return for Invoice ${invoice.invoice_number || invoiceId}`,
        category: "returns",
        sku: "RETURN",
        quantity: 1,
        actual_weight: 1.0,
        declared_currency: invoice.currency_code || "USD",
        declared_customs_value: 0
      })
    }

    const totalWeight = items.reduce((sum: number, item: any) => sum + (item.quantity * item.actual_weight), 0)

    // 3. Create Shipment on EasyShip
    const shipmentPayload = {
      origin_address: origin,
      destination_address: {
        line_1: "608 5th Ave",
        line_2: "Suite 501",
        city: "New York",
        state: "NY",
        postal_code: "10020",
        country_alpha2: "US",
        contact_name: "Returns Department",
        company_name: "Titan Diamond",
        phone: "212-555-0199",
        email: "returns@titandiamond.com"
      },
      incoterms: "DDP",
      insurance: { is_insured: false },
      courier_selection: { apply_cost_metrics: ["cheapest"] },
      shipping_settings: {
        units: { weight: "lb", dimensions: "in" }
      },
      parcels: [
        {
          total_actual_weight: totalWeight,
          box: { slug: "custom", length: 10, width: 10, height: 10 },
          items: items
        }
      ]
    }

    const easyshipUrl = 'https://api.easyship.com/2023-01/shipments'
    const createRes = await fetch(easyshipUrl, { signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EASYSHIP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shipmentPayload)
    })

    const createData: any = await createRes.json()
    if (!createRes.ok) {
      throw new Error(`EasyShip Create Shipment Error: ${createData.error?.message || JSON.stringify(createData)}`)
    }

    const shipmentId = createData.shipment?.easyship_shipment_id || createData.shipment?.shipment_id
    if (!shipmentId) {
      throw new Error('No shipment ID returned from EasyShip.')
    }

    // 4. Confirm/Buy the Label
    const labelRes = await fetch('https://api.easyship.com/2023-01/labels', { signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EASYSHIP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shipments: [
          {
            shipment_id: shipmentId
          }
        ]
      })
    })

    const labelData: any = await labelRes.json()
    if (!labelRes.ok) {
      throw new Error(`EasyShip Buy Label Error: ${labelData.error?.message || JSON.stringify(labelData)}`)
    }

    // 5. Poll for label generation
    let labelUrl = null
    let attempts = 0
    const maxAttempts = 8
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const pollRes = await fetch(`https://api.easyship.com/2023-01/shipments/${shipmentId}`, { signal: AbortSignal.timeout(15000),
        headers: {
          'Authorization': `Bearer ${EASYSHIP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (pollRes.ok) {
        const pollData: any = await pollRes.json()
        const shipment = pollData.shipment
        if (shipment) {
          if (shipment.label_state === 'generated' || shipment.label_url) {
            labelUrl = shipment.label_url
            break
          } else if (shipment.label_state === 'failed') {
            throw new Error('EasyShip label generation failed on the carrier side.')
          }
        }
      }
      attempts++
    }

    if (!labelUrl) {
      labelUrl = `https://app.easyship.com/shipments/${shipmentId}`
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ 
        success: true, 
        labelUrl: labelUrl,
        shipmentId: shipmentId 
      }),
    }
  } catch (err: any) {
    console.error('easyship-return error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    }
  }
}

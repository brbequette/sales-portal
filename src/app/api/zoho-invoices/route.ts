import { NextResponse } from 'next/server';

const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    try {
      const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      });
      const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        _cachedToken = data.access_token;
        _tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
        return _cachedToken;
      }
    } catch (e: any) {}
  }
  if (process.env.ZOHO_ACCESS_TOKEN) {
    _cachedToken = process.env.ZOHO_ACCESS_TOKEN;
    _tokenExpiresAt = now + 50 * 60 * 1000;
    return _cachedToken;
  }
  throw new Error('No Zoho OAuth credentials or Access Token configured.');
}

export async function GET() {
  try {
    const token = await getAccessToken();
    const authHeader = `Zoho-oauthtoken ${token}`;
    const invoiceBaseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices`;
    const soBaseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/salesorders`;

    const urls = [
      `${invoiceBaseUrl}?organization_id=${ORG_ID}&status=paid&per_page=200&page=1&sort_column=date&sort_order=D`,
      `${invoiceBaseUrl}?organization_id=${ORG_ID}&status=unpaid&per_page=200&page=1&sort_column=date&sort_order=D`,
      `${invoiceBaseUrl}?organization_id=${ORG_ID}&status=draft&per_page=200&page=1&sort_column=date&sort_order=D`,
      `${soBaseUrl}?organization_id=${ORG_ID}&per_page=200&page=1&sort_column=date&sort_order=D`,
      `${soBaseUrl}?organization_id=${ORG_ID}&per_page=200&page=2&sort_column=date&sort_order=D`
    ];

    const fetchPromises = urls.map(url =>
      fetch(url, { headers: { Authorization: authHeader } }).then(res => res.json())
    );

    const [paidData, unpaidData, draftData, soDataPage1, soDataPage2] = await Promise.all(fetchPromises);

    const paidInvoices = paidData.invoices || [];
    const unpaidInvoices = unpaidData.invoices || [];
    const draftInvoices = draftData.invoices || [];
    const sos1 = soDataPage1.salesorders || [];
    const sos2 = soDataPage2.salesorders || [];
    const allSos = [...sos1, ...sos2];

    const salesOrderDates: any = {};
    const salesOrderSalespersons: any = {};
    allSos.forEach(so => {
      if (so.salesorder_number) {
        salesOrderDates[so.salesorder_number.toString()] = so.date;
        salesOrderSalespersons[so.salesorder_number.toString()] = so.salesperson_name || null;
      }
    });

    const addSalesOrderDate = (inv: any) => {
      const parentSoNumber = inv.reference_number;
      const soDate = parentSoNumber ? salesOrderDates[parentSoNumber.toString()] : null;
      const soSalesperson = parentSoNumber ? salesOrderSalespersons[parentSoNumber.toString()] : null;
      return {
        ...inv,
        salesorder_date: soDate || null,
        salesorder_salesperson_name: soSalesperson || null
      };
    };

    const paidInvoicesMapped = paidInvoices.map(addSalesOrderDate);
    const unpaidInvoicesMapped = unpaidInvoices.map(addSalesOrderDate);
    const draftInvoicesMapped = draftInvoices.map(addSalesOrderDate);

    const rawActiveSos = allSos.filter(so => 
      so.status === 'open' || so.status === 'draft' || so.status === 'partially_invoiced'
    );
    const seenSoIds = new Set();
    const uniqueActiveSos = [];
    for (const so of rawActiveSos) {
      if (!seenSoIds.has(so.salesorder_id)) {
        seenSoIds.add(so.salesorder_id);
        uniqueActiveSos.push(so);
      }
    }

    const detailPromises = uniqueActiveSos.map(async (so) => {
      try {
        const detailUrl = `${soBaseUrl}/${so.salesorder_id}?organization_id=${ORG_ID}`;
        const detailRes = await fetch(detailUrl, { headers: { Authorization: authHeader } });
        const detailData = await detailRes.json();
        if (detailData.code === 0 && detailData.salesorder) {
          const detailedSo = detailData.salesorder;
          return {
            invoice_id: detailedSo.salesorder_id,
            invoice_number: `SO-${detailedSo.salesorder_number}`,
            customer_name: detailedSo.customer_name,
            salesperson_name: detailedSo.salesperson_name,
            sub_total: Number(detailedSo.sub_total !== undefined ? detailedSo.sub_total : (detailedSo.total || 0)),
            total: Number(detailedSo.total || 0),
            date: detailedSo.date,
            status: detailedSo.status,
            is_sales_order: true,
            cf_profit_unformatted: (() => {
              const deadCost = detailedSo.custom_field_hash?.cf_dead_cost_total_unformatted;
              const sub = Number(detailedSo.sub_total !== undefined ? detailedSo.sub_total : (detailedSo.total || 0));
              return deadCost !== undefined ? (sub - Number(deadCost)) : Number(detailedSo.custom_field_hash?.cf_estimated_profit_unformatted || 0);
            })(),
            cf_commision_amount_unformatted: Number(detailedSo.custom_field_hash?.cf_commission_amount_unformatted || 0),
            cf_salesperson_vig_unformatted: Number(detailedSo.custom_field_hash?.cf_salesperson_vig_unformatted || 1.3)
          };
        }
      } catch (err) {}

      return {
        invoice_id: so.salesorder_id,
        invoice_number: `SO-${so.salesorder_number}`,
        customer_name: so.customer_name,
        salesperson_name: so.salesperson_name,
        sub_total: Number(so.sub_total !== undefined ? so.sub_total : (so.total || 0)),
        total: Number(so.total || 0),
        date: so.date,
        status: so.status,
        is_sales_order: true,
        cf_profit_unformatted: 0,
        cf_commision_amount_unformatted: 0,
        cf_salesperson_vig_unformatted: Number(so.cf_salesperson_vig_unformatted || 1.3)
      };
    });

    const activeSosMapped = await Promise.all(detailPromises);

    const combined = [...paidInvoicesMapped, ...unpaidInvoicesMapped, ...draftInvoicesMapped, ...activeSosMapped].sort((a, b) => {
      const dateA = a.salesorder_date || a.date;
      const dateB = b.salesorder_date || b.date;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return NextResponse.json({ invoices: combined });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

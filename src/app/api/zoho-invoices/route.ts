import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractProfit, extractCommissionAmount, extractVigRate } from '@/lib/custom-field-extractor';


/**
 * GET /api/zoho-invoices
 * 
 * Returns all invoices + active sales orders from the LOCAL database.
 * No Zoho API calls -- data is kept current via:
 *   1. Daily sync (daily-books-sync scheduled function)
 *   2. Zoho webhooks (zoho-books-webhook)
 *   3. Portal saves (push to Zoho + update DB)
 * 
 * Query params:
 *   ?force=true  -- Reserved for future force-refresh from Zoho
 *   ?status=paid -- Filter by status
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    // Fetch all invoices from local DB
    const invoiceWhere: any = {};
    if (statusFilter) {
      // Map common status filters
      const statusMap: Record<string, string[]> = {
        'paid': ['Paid'],
        'unpaid': ['Sent', 'Overdue', 'Partially_Paid', 'Unpaid'],
        'draft': ['Draft'],
        'overdue': ['Overdue'],
      };
      const statuses = statusMap[statusFilter.toLowerCase()];
      if (statuses) {
        invoiceWhere.status = { in: statuses };
      }
    }

    const [invoices, salesOrders] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        include: { account: { select: { name: true } } },
        orderBy: { issueDate: 'desc' },
        take: 1000,
      }),
      prisma.salesOrder.findMany({
        where: {
          status: { in: ['open', 'draft', 'partially_invoiced', 'Open', 'Draft', 'Partially_Invoiced', 'Pending'] }
        },
        include: { account: { select: { name: true } } },
        orderBy: { orderDate: 'desc' },
        take: 500,
      }),
    ]);

    // Transform invoices to match the format components expect
    const invoicesMapped = invoices.map(inv => {
      const items = (inv.items as any) || {};
      return {
        invoice_id: inv.zohoId,
        invoice_number: items.invoiceNumber || `INV-${inv.zohoId?.slice(-6)}`,
        customer_name: items.customer_name || inv.account?.name || 'Unknown',
        salesperson_name: items.salesperson || null,
        sub_total: items.sub_total ?? inv.amount ?? 0,
        total: items.sub_total ?? inv.amount ?? 0,
        balance: items.balance ?? 0,
        date: inv.issueDate?.toISOString().split('T')[0] || '',
        due_date: inv.dueDate?.toISOString().split('T')[0] || '',
        status: mapStatusForClient(inv.status),
        is_sales_order: false,
        salesorder_date: items.salesorder_date || null,
        salesorder_salesperson_name: items.salesorder_salesperson_name || null,
        reference_number: items.reference_number || null,
        // Profit/commission from standardized extractors
        cf_profit_unformatted: extractProfit(items),
        deadProfit: (items.sub_total ?? inv.amount ?? 0) - (items.deadCostTotal ?? 0),
        cf_commision_amount_unformatted: extractCommissionAmount(items),
        cf_salesperson_vig_unformatted: extractVigRate(items),
        // Additional fields components may use
        line_items: items.line_items || [],
        custom_fields: items.custom_fields || [],
        shipping_charge: items.shippingCharge ?? 0,
        payment_date: items.paymentDate || null,
      };
    });

    // Transform sales orders to look like invoice-shaped objects (as the old route did)
    const sosMapped = salesOrders.map(so => {
      const items = (so.items as any) || {};
      return {
        invoice_id: so.zohoId || so.id,
        invoice_number: `SO-${items.salesOrderNumber || so.zohoId?.slice(-6) || so.id.slice(-6)}`,
        customer_name: items.customer_name || so.account?.name || 'Unknown',
        salesperson_name: items.salesperson || null,
        sub_total: items.sub_total ?? so.amount ?? 0,
        total: items.sub_total ?? so.amount ?? 0,
        balance: items.balance ?? so.amount ?? 0,
        date: so.orderDate?.toISOString().split('T')[0] || '',
        due_date: null,
        status: so.status?.toLowerCase() || 'open',
        is_sales_order: true,
        salesorder_date: so.orderDate?.toISOString().split('T')[0] || null,
        salesorder_salesperson_name: items.salesperson || null,
        reference_number: items.reference_number || null,
        cf_profit_unformatted: extractProfit(items),
        deadProfit: (items.sub_total ?? so.amount ?? 0) - (items.deadCostTotal ?? 0),
        cf_commision_amount_unformatted: extractCommissionAmount(items),
        cf_salesperson_vig_unformatted: extractVigRate(items),
        line_items: items.line_items || [],
        custom_fields: items.custom_fields || [],
        shipping_charge: items.shippingCharge ?? 0,
      };
    });


    // Combine and sort by date descending (same as old route)
    const combined = [...invoicesMapped, ...sosMapped].sort((a: any, b: any) => {
      const dateA = a.salesorder_date || a.date;
      const dateB = b.salesorder_date || b.date;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return NextResponse.json({ invoices: combined });
  } catch (err: any) {
    console.error('zoho-invoices DB error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Map internal DB status to the format the client expects */
function mapStatusForClient(status: string): string {
  const lower = status?.toLowerCase() || '';
  if (lower === 'paid' || lower === 'closed') return 'paid';
  if (lower === 'sent' || lower === 'unpaid' || lower === 'partially_paid' || lower === 'overdue') return lower;
  if (lower === 'draft') return 'draft';
  if (lower === 'void' || lower === 'voided') return 'void';
  return lower || 'draft';
}

/** Extract a value from the custom_fields array in the items JSON */
function extractCustomField(items: any, fieldName: string): number | null {
  if (!items.custom_fields || !Array.isArray(items.custom_fields)) return null;
  const field = items.custom_fields.find((f: any) => f.api_name === fieldName || f.label === fieldName);
  if (field && field.value !== undefined && field.value !== '') {
    return parseFloat(field.value) || 0;
  }
  return null;
}

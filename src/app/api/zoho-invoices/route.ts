import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractProfit, extractCommissionAmount, extractVigRate } from '@/lib/custom-field-extractor';

/**
 * GET /api/zoho-invoices
 * 
 * Returns all invoices + sales orders from the LOCAL database for Dashboard & Sales calculations.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    // Fetch all invoices from local DB
    const invoiceWhere: any = {};
    if (statusFilter) {
      const statusMap: Record<string, string[]> = {
        'paid': ['Paid', 'paid', 'closed'],
        'unpaid': ['Sent', 'Overdue', 'Partially_Paid', 'Unpaid', 'sent', 'overdue', 'partially_paid', 'unpaid'],
        'draft': ['Draft', 'draft'],
        'overdue': ['Overdue', 'overdue'],
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
        take: 2000,
      }),
      prisma.salesOrder.findMany({
        include: { account: { select: { name: true } } },
        orderBy: { orderDate: 'desc' },
        take: 1000,
      }),
    ]);

    // Transform invoices to match component expectations with robust date fallbacks
    const invoicesMapped = invoices.map(inv => {
      const items = (inv.items as any) || {};
      const rawDate = inv.issueDate || items.date || items.invoice_date || items.created_time || inv.createdAt;
      const formattedDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : new Date(inv.createdAt).toISOString().split('T')[0];

      return {
        invoice_id: inv.zohoId,
        invoice_number: items.invoiceNumber || `INV-${inv.zohoId?.slice(-6)}`,
        customer_name: items.customer_name || inv.account?.name || 'Unknown',
        salesperson_name: items.salesperson || items.salesperson_name || null,
        sub_total: items.sub_total ?? inv.amount ?? 0,
        total: items.sub_total ?? inv.amount ?? 0,
        balance: items.balance ?? 0,
        date: formattedDate,
        due_date: inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : formattedDate,
        status: mapStatusForClient(inv.status),
        is_sales_order: false,
        salesorder_date: formattedDate,
        salesorder_salesperson_name: items.salesorder_salesperson_name || items.salesperson || null,
        reference_number: items.reference_number || null,
        cf_profit_unformatted: extractProfit(items),
        deadProfit: (items.sub_total ?? inv.amount ?? 0) - (items.deadCostTotal ?? 0),
        cf_commision_amount_unformatted: extractCommissionAmount(items),
        cf_salesperson_vig_unformatted: extractVigRate(items),
        line_items: items.line_items || [],
        custom_fields: items.custom_fields || [],
        shipping_charge: items.shippingCharge ?? 0,
        payment_date: items.paymentDate || null,
      };
    });

    // Transform sales orders
    const sosMapped = salesOrders.map(so => {
      const items = (so.items as any) || {};
      const rawDate = so.orderDate || items.date || items.salesorder_date || items.created_time || so.createdAt;
      const formattedDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : new Date(so.createdAt).toISOString().split('T')[0];

      return {
        invoice_id: so.zohoId || so.id,
        invoice_number: `SO-${items.salesOrderNumber || so.zohoId?.slice(-6) || so.id.slice(-6)}`,
        customer_name: items.customer_name || so.account?.name || 'Unknown',
        salesperson_name: items.salesperson || items.salesperson_name || null,
        sub_total: items.sub_total ?? so.amount ?? 0,
        total: items.sub_total ?? so.amount ?? 0,
        balance: items.balance ?? so.amount ?? 0,
        date: formattedDate,
        due_date: null,
        status: so.status?.toLowerCase() || 'open',
        is_sales_order: true,
        salesorder_date: formattedDate,
        salesorder_salesperson_name: items.salesperson || items.salesperson_name || null,
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

    // Combine and sort by date descending
    const combined = [...invoicesMapped, ...sosMapped].sort((a: any, b: any) => {
      const dateA = a.salesorder_date || a.date;
      const dateB = b.salesorder_date || b.date;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return NextResponse.json({ invoices: combined });
  } catch (err: any) {
    console.error('zoho-invoices DB error:', err);
    return NextResponse.json({ invoices: [], error: err.message });
  }
}

function mapStatusForClient(status: string): string {
  const lower = status?.toLowerCase() || '';
  if (lower === 'paid' || lower === 'closed') return 'paid';
  if (lower === 'sent' || lower === 'unpaid' || lower === 'partially_paid' || lower === 'overdue') return lower;
  if (lower === 'draft') return 'draft';
  if (lower === 'void' || lower === 'voided') return 'void';
  return lower || 'draft';
}

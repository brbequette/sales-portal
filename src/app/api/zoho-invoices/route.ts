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

    const getSubTotal = (items: any, amount: number) => {
      let sub = parseFloat(items.sub_total ?? items.subTotal ?? 0)
      if (isNaN(sub) || sub === 0) {
        const details = items.lineItemDetails || items.line_items || items.items
        if (Array.isArray(details)) {
          sub = details.reduce((sum: number, it: any) => {
            if (it.line_item_category === "header" || it.line_item_category === "subtotal") return sum;
            const qty = parseFloat(it.quantity || 0)
            const rate = parseFloat(it.rate || it.itemTotal || it.item_total || 0)
            return sum + (qty * rate)
          }, 0)
        }
      }
      if (isNaN(sub) || sub === 0) {
        sub = amount || 0
      }
      return sub
    }

    // Transform invoices to match component expectations with robust date fallbacks
    const invoicesMapped = invoices.map(inv => {
      const items = (inv.items as any) || {};
      const rawDate = inv.issueDate || items.date || items.invoice_date || items.created_time || inv.createdAt;
      const formattedDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : new Date(inv.createdAt).toISOString().split('T')[0];

      const subTotalVal = getSubTotal(items, inv.amount);

      return {
        invoice_id: inv.zohoId,
        invoice_number: (inv as any).invoiceNumber || items.invoice_number || items.invoiceNumber || `INV-${inv.zohoId?.slice(-6)}`,
        customer_name: items.customer_name || inv.account?.name || 'Unknown',
        salesperson_name: items.salesperson_name || items.salesperson || null,
        sub_total: subTotalVal,
        total: subTotalVal,
        balance: inv.balance ?? items.balance ?? 0,
        date: formattedDate,
        due_date: inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : formattedDate,
        status: mapStatusForClient(inv.status),
        entity_type: 'invoice',
        is_sales_order: false,
        salesorder_date: formattedDate,
        salesorder_salesperson_name: items.salesorder_salesperson_name || items.salesperson_name || items.salesperson || null,
        reference_number: items.reference_number || null,
        cf_profit_unformatted: extractProfit(items),
        deadProfit: (() => {
          const sub = subTotalVal
          let dc = (items.deadCostTotal ?? 0)
          if ((isNaN(dc) || dc === 0) && sub > 0) dc = sub * 0.50
          return sub - dc
        })(),
        cf_commision_amount_unformatted: extractCommissionAmount(items),
        cf_salesperson_vig_unformatted: extractVigRate(items),
        line_items: items.line_items || [],
        custom_fields: items.custom_fields || [],
        shipping_charge: items.shipping_charge ?? items.shippingCharge ?? 0,
        payment_date: items.last_payment_date || items.paymentDate || null,
      };
    });

    // Transform sales orders
    const sosMapped = salesOrders.map(so => {
      const items = (so.items as any) || {};
      const rawDate = so.orderDate || items.date || items.salesorder_date || items.created_time || so.createdAt;
      const formattedDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : new Date(so.createdAt).toISOString().split('T')[0];

      const subTotalVal = getSubTotal(items, so.amount);

      return {
        invoice_id: so.zohoId || so.id,
        invoice_number: `SO-${items.salesOrderNumber || so.zohoId?.slice(-6) || so.id.slice(-6)}`,
        customer_name: items.customer_name || so.account?.name || 'Unknown',
        salesperson_name: items.salesperson || items.salesperson_name || null,
        sub_total: subTotalVal,
        total: subTotalVal,
        balance: items.balance ?? so.amount ?? 0,
        date: formattedDate,
        due_date: null,
        status: so.status?.toLowerCase() || 'open',
        entity_type: 'salesorder',
        is_sales_order: true,
        salesorder_date: formattedDate,
        salesorder_salesperson_name: items.salesperson || items.salesperson_name || null,
        reference_number: items.reference_number || null,
        cf_profit_unformatted: extractProfit(items),
        deadProfit: (() => {
          const sub = subTotalVal
          let dc = (items.deadCostTotal ?? 0)
          if ((isNaN(dc) || dc === 0) && sub > 0) dc = sub * 0.50
          return sub - dc
        })(),
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

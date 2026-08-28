import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractProfit, extractCommissionAmount, extractVigRate } from '@/lib/custom-field-extractor';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdministratorRole } from '@/lib/roles';

function getSubTotal(items: any, amount: number) {
  let sub = parseFloat(items.sub_total ?? items.subTotal ?? 0);
  if (isNaN(sub) || sub === 0) {
    const details = items.lineItemDetails || items.line_items || items.items;
    if (Array.isArray(details)) {
      sub = details.reduce((sum: number, item: any) => {
        if (item.line_item_category === 'header' || item.line_item_category === 'subtotal') return sum;
        return sum + (parseFloat(item.quantity || 0) * parseFloat(item.rate || item.itemTotal || item.item_total || 0));
      }, 0);
    }
  }
  return isNaN(sub) || sub === 0 ? amount || 0 : sub;
}

/**
 * GET /api/zoho-invoices
 * 
 * Returns all invoices + sales orders from the LOCAL database for Dashboard & Sales calculations.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const actorId = session.user.dbId || session.user.id;
    const canViewCompanyDocuments = isAdministratorRole(session.user.role)
      || String(session.user.role || '').toLowerCase().includes('manager');
    const documentScope = canViewCompanyDocuments ? {} : { account: { ownerId: actorId } };

    if (searchParams.get('summary') === 'true') {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 7));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 7));
      const [monthInvoices, monthOrders, invoiceBalances, orderPipeline] = await Promise.all([
        prisma.invoice.findMany({
          where: { issueDate: { gte: monthStart, lt: monthEnd } },
          select: { amount: true, items: true, computedProfit: true, computedUpfront: true, computedFinal: true },
        }),
        prisma.salesOrder.findMany({
          where: { orderDate: { gte: monthStart, lt: monthEnd } },
          select: { amount: true, items: true },
        }),
        prisma.invoice.findMany({
          where: { balance: { gt: 0 }, status: { notIn: ['Paid', 'paid', 'closed', 'Void', 'void', 'voided', 'Draft', 'draft'] } },
          select: { balance: true, dueDate: true, status: true },
        }),
        prisma.salesOrder.aggregate({
          where: { status: { notIn: ['Paid', 'paid', 'closed', 'Void', 'void', 'voided', 'Draft', 'draft', 'Invoiced', 'invoiced', 'billed'] } },
          _sum: { amount: true },
        }),
      ]);

      let mtdSales = 0;
      let mtdProfit = 0;
      let mtdCommission = 0;
      const includeRep = (items: any) => {
        const rep = String(items?.salesorder_salesperson_name || items?.salesperson_name || items?.salesperson || '').toUpperCase();
        return !(rep.includes('PAUL') && (rep.includes('GENCUSKI') || rep.includes('GENKUSKI')));
      };
      for (const invoice of monthInvoices) {
        const items = (invoice.items as any) || {};
        if (!includeRep(items)) continue;
        mtdSales += getSubTotal(items, invoice.amount);
        mtdProfit += Number(invoice.computedProfit ?? extractProfit(items)) || 0;
        mtdCommission += Number(
          invoice.computedUpfront != null || invoice.computedFinal != null
            ? (invoice.computedUpfront || 0) + (invoice.computedFinal || 0)
            : extractCommissionAmount(items)
        ) || 0;
      }
      for (const order of monthOrders) {
        const items = (order.items as any) || {};
        if (!includeRep(items)) continue;
        mtdSales += getSubTotal(items, order.amount);
        mtdProfit += Number(extractProfit(items)) || 0;
        mtdCommission += Number(extractCommissionAmount(items)) || 0;
      }

      const invoicePipeline = invoiceBalances.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
      const overdue = invoiceBalances.reduce((sum, invoice) => {
        const explicitlyOverdue = String(invoice.status).toLowerCase() === 'overdue';
        return explicitlyOverdue || (invoice.dueDate && invoice.dueDate < now)
          ? sum + Number(invoice.balance || 0)
          : sum;
      }, 0);

      return NextResponse.json({
        summary: {
          mtdSales,
          mtdProfit,
          mtdCommission,
          pipeline: invoicePipeline + Number(orderPipeline._sum.amount || 0),
          overdue,
        },
      });
    }

    if (searchParams.get('view') === 'pipeline') {
      if (!isAdministratorRole(session.user.role)) {
        return NextResponse.json({ error: 'Administrator access required' }, { status: 403 });
      }

      const [pipelineInvoices, pipelineOrders] = await Promise.all([
        prisma.invoice.findMany({
          where: {
            ...documentScope,
            salesOrderZohoId: { not: null },
            status: { in: ['Draft', 'draft'] },

          },
          select: {
            id: true, zohoId: true, invoiceNumber: true, amount: true, balance: true,
            status: true, issueDate: true, dueDate: true, items: true,
            computedProfit: true, computedSalesperson: true, syncConflict: true, pendingCostSync: true, costsCalculatedAt: true,
            account: { select: { name: true } },
          },
          orderBy: { issueDate: 'desc' },
          take: 1000,
        }),
        prisma.salesOrder.findMany({
          where: {
            ...documentScope,
            status: { notIn: ['Void', 'void', 'voided', 'Deleted', 'deleted', 'Cancelled', 'cancelled', 'canceled', 'Invoiced', 'invoiced', 'billed'] },
          },
          select: {
            id: true, zohoId: true, amount: true, status: true, orderDate: true,
            items: true, syncConflict: true, pendingCostSync: true, costsCalculatedAt: true, account: { select: { name: true } },
          },
          orderBy: { orderDate: 'desc' },
          take: 1000,
        }),

      ]);

      const now = Date.now();
      const makeDeal = (record: any, type: 'invoice' | 'salesorder') => {
        const items = record.items || {};
        const dateValue = record.issueDate || record.orderDate || items.date || items.estimate_date || record.createdAt;
        const date = new Date(dateValue);        const balance = Number(record.balance ?? items.balance ?? record.amount ?? 0) || 0;
        let stage: string = type;
        if (type === 'invoice') stage = 'billing';
        const id = record.zohoId || record.id;
        return {
          id,
          customer: String(items.customer_name || record.account?.name || 'UNKNOWN').toUpperCase(),
          invoiceNumber: String(record.invoiceNumber || items.invoiceNumber || items.salesOrderNumber || items.invoice_number || items.salesorder_number || items.salesorderNumber || items.estimate_number || record.zohoId || record.id),
          amount: getSubTotal(items, record.amount),
          profit: Number(record.computedProfit ?? extractProfit(items)) || 0,
          date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
          daysInStage: Number.isNaN(date.getTime()) ? 0 : Math.max(0, Math.floor((now - date.getTime()) / 86_400_000)),
          stage,
          rep: String(record.computedSalesperson || items.salesorder_salesperson_name || items.salesperson_name || items.salesperson || 'UNKNOWN').toUpperCase(),
          balance,
          documentType: type,
          documentStatus: record.status,
          salesOrderZohoId: record.salesOrderZohoId || items.salesorder_id || null,
          dueDate: record.dueDate || null,
          syncConflict: record.syncConflict === true,
          pendingCostSync: record.pendingCostSync === true,
          costReady: Boolean(record.costsCalculatedAt || items.deadCostTotal !== undefined || items.profit !== undefined),
          lineCount: Array.isArray(items.line_items) ? items.line_items.length : 0,
        };
      };

      return NextResponse.json({
        deals: [
          ...pipelineOrders.map(record => makeDeal(record, 'salesorder')),
          ...pipelineInvoices.map(record => makeDeal(record, 'invoice')),
        ],
      });
    }

    // Fetch all invoices from local DB
    const invoiceWhere: any = { ...documentScope };
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
        where: documentScope,
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
          if ((isNaN(dc) || dc === 0) && sub > 0) dc = sub * 0.60
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
          if ((isNaN(dc) || dc === 0) && sub > 0) dc = sub * 0.60
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

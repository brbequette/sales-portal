import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const type = searchParams.get('type') || 'All';
    const statusParams = searchParams.get('status');
    const statusFilters = statusParams ? statusParams.split(',').map(s => s.toLowerCase()) : [];
    const sortBy = searchParams.get('sortBy') || 'date-desc';

    // Fetch data from local database
    const [quotes, salesOrders, invoices] = await Promise.all([
      type === 'All' || type === 'Quote' ? prisma.quote.findMany({ include: { account: { select: { name: true, zohoId: true } } } }) : Promise.resolve([]),
      type === 'All' || type === 'SalesOrder' ? prisma.salesOrder.findMany({ include: { account: { select: { name: true, zohoId: true } } } }) : Promise.resolve([]),
      type === 'All' || type === 'Invoice' ? prisma.invoice.findMany({ include: { account: { select: { name: true, zohoId: true } } } }) : Promise.resolve([])
    ]);

    const buildDoc = (raw: any, t: "Quote" | "SalesOrder" | "Invoice") => {
      let profit = 0;
      const items = raw.items as any;
      if (items && !Array.isArray(items) && items.profit) {
        profit = parseFloat(items.profit);
      } else if (Array.isArray(items)) {
        profit = items.reduce((sum: number, it: any) => sum + parseFloat(it.profit || 0), 0);
      }
      
      const dateStr = raw.issueDate?.toISOString() || raw.orderDate?.toISOString() || raw.createdAt?.toISOString() || new Date().toISOString();
      const statusStr = raw.status || "Draft";
      
      return {
        id: raw.id,
        zohoId: raw.zohoId,
        type: t,
        accountName: raw.account?.name || 'Unknown',
        accountZohoId: raw.account?.zohoId || '',
        status: statusStr,
        date: dateStr,
        amount: parseFloat(raw.amount || 0),
        profit,
        invoiceNumber: items?.invoiceNumber || items?.invoice_number || items?.estimateNumber || items?.estimate_number || items?.salesOrderNumber || items?.salesorder_number || items?.quoteNumber || (raw.zohoId || raw.id).slice(-6),
        raw
      };
    };

    let allDocs: any[] = [];
    quotes.forEach((q: any) => allDocs.push(buildDoc(q, "Quote")));
    salesOrders.forEach((s: any) => allDocs.push(buildDoc(s, "SalesOrder")));
    invoices.forEach((i: any) => allDocs.push(buildDoc(i, "Invoice")));

    // Filter by status
    if (statusFilters.length > 0) {
      allDocs = allDocs.filter(d => {
        const sLower = (d.status || '').toLowerCase();
        return statusFilters.some(f => {
          if (f === 'unpaid') {
            return sLower !== 'paid' && sLower !== 'void' && sLower !== 'voided' && sLower !== 'draft' && sLower !== 'closed';
          }
          return sLower === f;
        });
      });
    }

    // Filter by search
    if (search) {
      allDocs = allDocs.filter(d => 
        d.accountName.toLowerCase().includes(search) ||
        d.id.toLowerCase().includes(search) ||
        (d.zohoId || "").toLowerCase().includes(search) ||
        (d.invoiceNumber || "").toLowerCase().includes(search)
      );
    }

    // Sort
    if (sortBy === "date-desc") {
      allDocs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (sortBy === "date-asc") {
      allDocs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else if (sortBy === "amount-desc") {
      allDocs.sort((a, b) => b.amount - a.amount);
    } else if (sortBy === "amount-asc") {
      allDocs.sort((a, b) => a.amount - b.amount);
    }

    // Paginate
    const totalCount = allDocs.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedDocs = allDocs.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      success: true,
      documents: paginatedDocs,
      pagination: { totalCount }
    });

  } catch (err: any) {
    console.error('get-documents error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { getZohoAccessToken, pushZohoNote } from '@/lib/zoho-auth';

// Rate Limiter: 30 requests per minute per user
const rateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS = 30;

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimit.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_REQUESTS) {
    return false;
  }

  record.count += 1;
  return true;
}

// Lazy singleton for OpenAI client
let openai: OpenAI | null = null;
function getOpenAIClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// Helpers
function isAdmin(role: string): boolean {
  return role?.toLowerCase().includes('admin') || role === 'ADMIN';
}

function buildOwnerFilter(userRole: string, userId: string, repIdArg?: string) {
  if (isAdmin(userRole)) {
    return repIdArg ? { ownerId: repIdArg } : {};
  }
  return { ownerId: userId };
}

function getDateRange(period: string) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
  if (period === 'last_month') {
    start.setMonth(start.getMonth() - 1);
    end.setMonth(start.getMonth(), 0);
  } else if (period === 'this_year') {
    start.setMonth(0, 1);
  } else if (period === 'all') {
    return {};
  }
  
  return { gte: start, lte: end };
}

// Tool Implementation Logic
async function executeTool(name: string, args: any, context: { userId: string, userRole: string, userName: string }) {
  const { userId, userRole } = context;

  try {
    switch (name) {
      case 'query_invoices': {
        const { status, dateFrom, dateTo, accountName, limit = 20 } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        
        let accountFilter: any = { ...ownerFilter };
        if (accountName) {
          accountFilter.name = { contains: accountName, mode: 'insensitive' };
        }

        const dateFilter: any = {};
        if (dateFrom) dateFilter.gte = new Date(dateFrom);
        if (dateTo) dateFilter.lte = new Date(dateTo);

        const where: any = {};
        if (Object.keys(accountFilter).length > 0) {
          where.account = accountFilter;
        }
        if (Object.keys(dateFilter).length > 0) {
          where.issueDate = dateFilter;
        }
        if (status && status !== 'all') {
          if (status === 'unpaid') {
            where.status = { notIn: ['paid', 'Paid', 'void', 'Void'] };
          } else {
            where.status = { equals: status, mode: 'insensitive' };
          }
        }

        const invoices = await prisma.invoice.findMany({
          where,
          include: { account: { select: { name: true } } },
          take: limit,
          orderBy: { issueDate: 'desc' }
        });

        return invoices.map((inv: any) => ({
          invoiceNumber: inv.computedInvoiceNumber || inv.zohoId,
          amount: inv.amount,
          status: inv.status,
          issueDate: inv.issueDate,
          accountName: inv.account?.name || 'Unknown',
          profit: inv.computedProfit,
          upfront: inv.computedUpfront,
          final: inv.computedFinal,
          balance: inv.balance
        }));
      }

      case 'query_accounts': {
        const { search, status, quality, limit = 20 } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        
        const where: any = { ...ownerFilter };
        if (search) where.name = { contains: search, mode: 'insensitive' };
        if (status) where.status = { equals: status, mode: 'insensitive' };
        if (quality) where.quality = { equals: quality, mode: 'insensitive' };

        const accounts = await prisma.account.findMany({
          where,
          include: { contacts: true },
          take: limit,
          orderBy: { lastPurchaseAt: 'desc' }
        });

        return accounts.map((acc: any) => ({
          name: acc.name,
          status: acc.status,
          quality: acc.quality,
          billingCity: acc.billingCity,
          billingState: acc.billingState,
          contactCount: acc.contacts.length,
          lastPurchaseAt: acc.lastPurchaseAt
        }));
      }

      case 'query_commissions_summary': {
        const { period = 'this_month' } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        const dateRange = getDateRange(period);

        const invoiceWhere: any = {
          account: { ...ownerFilter },
          status: { notIn: ['void', 'Void'] }
        };
        if (Object.keys(dateRange).length > 0) {
          invoiceWhere.issueDate = dateRange;
        }

        const invoices = await prisma.invoice.findMany({ where: invoiceWhere });
        let totalProfit = 0, totalUpfront = 0, totalFinal = 0;
        invoices.forEach(inv => {
          totalProfit += Number(inv.computedProfit || 0);
          totalUpfront += Number(inv.computedUpfront || 0);
          totalFinal += Number(inv.computedFinal || 0);
        });
        
        const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

        const payoutWhere: any = { repId: userId };
        if (Object.keys(dateRange).length > 0) {
          payoutWhere.date = dateRange;
        }
        
        const payouts = await prisma.payout.findMany({ where: payoutWhere });
        const totalPaid = payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        return {
          totalProfit,
          totalUpfront,
          totalFinal,
          totalPaid,
          invoiceCount: invoices.length,
          avgDealSize: invoices.length > 0 ? totalSales / invoices.length : 0
        };
      }

      case 'query_payouts': {
        const { limit = 20 } = args;
        const payouts = await prisma.payout.findMany({
          where: { repId: userId },
          take: limit,
          orderBy: { date: 'desc' }
        });
        return payouts.map(p => ({
          date: p.date,
          amount: p.amount,
          method: p.method,
          notes: p.notes
        }));
      }

      case 'query_tasks': {
        const { status, limit = 20 } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        
        const where: any = { ...ownerFilter };
        if (status && status !== 'all') {
          where.status = { equals: status, mode: 'insensitive' };
        }

        const tasks = await prisma.task.findMany({
          where,
          include: { account: { select: { name: true } } },
          take: limit,
          orderBy: { dueDate: 'asc' }
        });

        return tasks.map((t: any) => ({
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          accountName: t.account?.name || 'Unknown'
        }));
      }

      case 'query_rep_stats': {
        const ownerFilter = { ownerId: userId };
        
        const accountsCount = await prisma.account.count({ where: ownerFilter });
        
        const thisMonth = getDateRange('this_month');
        const invoices = await prisma.invoice.findMany({
          where: {
            account: ownerFilter,
            issueDate: thisMonth,
            status: { notIn: ['void', 'Void'] }
          }
        });
        
        const totalSales = invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);
        const totalProfit = invoices.reduce((sum, i) => sum + Number(i.computedProfit || 0), 0);
        const totalUpfront = invoices.reduce((sum, i) => sum + Number(i.computedUpfront || 0), 0);
        const totalFinal = invoices.reduce((sum, i) => sum + Number(i.computedFinal || 0), 0);
        
        const pendingTasksCount = await prisma.task.count({
          where: { ...ownerFilter, status: { notIn: ['Completed', 'completed'] } }
        });

        const timeEntries = await prisma.timeEntry.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: 1
        });
        const lastClockStatus = timeEntries[0] ? (timeEntries[0].clockOut ? 'Clocked Out' : 'Clocked In') : 'Unknown';
        
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const vigGoal = await prisma.monthlyVigGoal.findFirst({
          where: { repId: userId, monthKey }
        });

        const advances = await prisma.advance.findMany({
          where: { userId, isFullyPaid: false }
        });
        const outstandingAdvances = advances.reduce((sum, a) => sum + (Number(a.amount) - Number(a.amountPaidBack)), 0);

        return {
          accountsCount,
          thisMonthInvoicesCount: invoices.length,
          thisMonthTotalSales: totalSales,
          thisMonthProfit: totalProfit,
          thisMonthUpfront: totalUpfront,
          thisMonthFinal: totalFinal,
          pendingTasksCount,
          lastClockStatus,
          vigProfitGoal: vigGoal?.profitGoal || 0,
          outstandingAdvances
        };
      }

      case 'search_products': {
        const { search, category, limit = 20 } = args;
        const where: any = {};
        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } }
          ];
        }
        if (category) {
          where.category = { equals: category, mode: 'insensitive' };
        }

        const products = await prisma.product.findMany({
          where,
          take: limit
        });
        return products.map(p => ({
          name: p.name,
          sku: p.sku,
          price: p.price,
          category: p.category,
          stock: p.stock
        }));
      }

      case 'query_deals': {
        const { stage, accountName, dateFrom, dateTo, limit = 20 } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        
        const where: any = { ...ownerFilter };
        if (stage) where.stage = { equals: stage, mode: 'insensitive' };
        
        if (accountName) {
          where.account = { name: { contains: accountName, mode: 'insensitive' } };
        }

        const dateFilter: any = {};
        if (dateFrom) dateFilter.gte = new Date(dateFrom);
        if (dateTo) dateFilter.lte = new Date(dateTo);
        if (Object.keys(dateFilter).length > 0) {
          where.closingDate = dateFilter;
        }

        const deals = await prisma.deal.findMany({
          where,
          include: { account: { select: { name: true } } },
          take: limit,
          orderBy: { closingDate: 'desc' }
        });

        return deals.map((d: any) => ({
          name: d.name,
          amount: d.amount,
          stage: d.stage,
          closingDate: d.closingDate,
          accountName: d.account?.name || 'Unknown'
        }));
      }

      case 'query_sales_orders': {
        const { status, dateFrom, dateTo, limit = 20 } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        
        const where: any = {};
        if (Object.keys(ownerFilter).length > 0) {
          where.account = ownerFilter;
        }
        if (status) where.status = { equals: status, mode: 'insensitive' };

        const dateFilter: any = {};
        if (dateFrom) dateFilter.gte = new Date(dateFrom);
        if (dateTo) dateFilter.lte = new Date(dateTo);
        if (Object.keys(dateFilter).length > 0) {
          where.orderDate = dateFilter;
        }

        const orders = await prisma.salesOrder.findMany({
          where,
          include: { account: { select: { name: true } } },
          take: limit,
          orderBy: { orderDate: 'desc' }
        });

        return orders.map((o: any) => ({
          id: o.zohoId || o.id,
          amount: o.amount,
          status: o.status,
          orderDate: o.orderDate,
          accountName: o.account?.name || 'Unknown'
        }));
      }

      case 'query_collections': {
        const { minDaysOverdue = 1, limit = 20 } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        
        const where: any = {
          status: { in: ['overdue', 'Overdue', 'sent', 'Sent', 'partially_paid'] },
          dueDate: { lt: new Date() }
        };
        if (Object.keys(ownerFilter).length > 0) {
          where.account = ownerFilter;
        }

        const invoices = await prisma.invoice.findMany({
          where,
          include: { account: { select: { name: true } } },
          orderBy: { dueDate: 'asc' }
        });

        const now = Date.now();
        const overdueInvoices = invoices.map((inv: any) => {
          const dueTime = inv.dueDate ? new Date(inv.dueDate).getTime() : now;
          const daysOverdue = Math.floor((now - dueTime) / (1000 * 60 * 60 * 24));
          return {
            invoiceNumber: inv.computedInvoiceNumber || inv.zohoId,
            amount: inv.amount,
            balance: inv.balance,
            status: inv.status,
            dueDate: inv.dueDate,
            daysOverdue,
            accountName: inv.account?.name || 'Unknown'
          };
        }).filter((inv: any) => inv.daysOverdue >= minDaysOverdue).slice(0, limit);

        return overdueInvoices;
      }

      case 'query_time_entries': {
        const { dateFrom, dateTo, limit = 20 } = args;
        const where: any = { userId };
        
        // TimeEntry.date is a String (YYYY-MM-DD), so use string comparison
        if (dateFrom || dateTo) {
          where.date = {};
          if (dateFrom) where.date.gte = dateFrom.slice(0, 10); // YYYY-MM-DD
          if (dateTo) where.date.lte = dateTo.slice(0, 10);
        }

        const entries = await prisma.timeEntry.findMany({
          where,
          take: limit,
          orderBy: { date: 'desc' }
        });

        return entries.map((e: any) => {
          let computedHours = null;
          const cin = e.manualClockIn || e.clockIn;
          const cout = e.manualClockOut || e.clockOut;
          if (cin && cout) {
            computedHours = (new Date(cout).getTime() - new Date(cin).getTime()) / (1000 * 60 * 60);
          }
          return {
            date: e.date,
            clockIn: cin,
            clockOut: cout,
            computedHours: computedHours ? parseFloat(computedHours.toFixed(2)) : null
          };
        });
      }

      case 'query_vig_goals': {
        let { monthKey } = args;
        if (!monthKey) {
          const now = new Date();
          monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        const goal = await prisma.monthlyVigGoal.findFirst({
          where: { repId: userId, monthKey }
        });

        const [year, month] = monthKey.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);

        const invoices = await prisma.invoice.findMany({
          where: {
            account: { ownerId: userId },
            issueDate: { gte: start, lte: end },
            status: { notIn: ['void', 'Void'] }
          }
        });

        const actualProfit = invoices.reduce((sum, inv) => sum + Number(inv.computedProfit || 0), 0);
        const actualSubtotal = invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

        return {
          monthKey,
          profitGoal: goal?.profitGoal || 0,
          subtotalGoal: goal?.subtotalGoal || 0,
          vigRate: goal?.manualVigRate || goal?.lastSyncedVigRate || 0,
          actualProfit,
          actualSubtotal,
          onTrack: goal ? actualProfit >= Number(goal.profitGoal) : false
        };
      }

      case 'query_leads': {
        const { status, disposition, limit = 20 } = args;
        const ownerFilter = buildOwnerFilter(userRole, userId);
        
        const where: any = { ...ownerFilter };
        if (status) where.status = { equals: status, mode: 'insensitive' };
        if (disposition) where.disposition = { equals: disposition, mode: 'insensitive' };

        const leads = await prisma.lead.findMany({
          where,
          take: limit,
          orderBy: { company: 'asc' }
        });

        return leads.map(l => ({
          company: l.company,
          firstName: l.firstName,
          lastName: l.lastName,
          status: l.status,
          disposition: l.disposition
        }));
      }

      case 'query_advances': {
        const advances = await prisma.advance.findMany({
          where: { userId }
        });

        return advances.map(a => ({
          amount: a.amount,
          amountPaidBack: a.amountPaidBack,
          remaining: Number(a.amount) - Number(a.amountPaidBack),
          isFullyPaid: a.isFullyPaid,
          termWeeks: a.termWeeks
        }));
      }

      case 'query_company_summary': {
        const { period = 'this_month' } = args;
        const dateRange = getDateRange(period);

        const where: any = { status: { notIn: ['void', 'Void'] } };
        if (Object.keys(dateRange).length > 0) {
          where.issueDate = dateRange;
        }

        const invoices = await prisma.invoice.findMany({ where });
        
        const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
        const totalProfit = invoices.reduce((sum, inv) => sum + Number(inv.computedProfit || 0), 0);
        
        return {
          period,
          totalSales,
          totalProfit,
          invoiceCount: invoices.length,
          avgDealSize: invoices.length > 0 ? totalSales / invoices.length : 0
        };
      }

      case 'query_users': {
        if (!isAdmin(userRole)) {
          return { error: 'Admin access required for this query' };
        }

        const users = await prisma.user.findMany();
        const thisMonth = getDateRange('this_month');
        
        const invoices = await prisma.invoice.findMany({
          where: {
            issueDate: thisMonth,
            status: { notIn: ['void', 'Void'] }
          },
          include: { account: { select: { ownerId: true } } }
        });

        const accounts = await prisma.account.findMany({
          select: { ownerId: true }
        });

        const userStats = users.map((user: any) => {
          const userInvoices = invoices.filter((inv: any) => inv.account?.ownerId === user.id);
          const thisMonthSales = userInvoices.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0);
          const accountCount = accounts.filter((acc: any) => acc.ownerId === user.id).length;
          
          return {
            id: user.id,
            name: user.name,
            role: user.role,
            thisMonthSales,
            thisMonthInvoiceCount: userInvoices.length,
            accountCount
          };
        });

        return userStats;
      }

      case 'toggle_timeclock': {
        const { action } = args;
        if (action !== 'clockIn' && action !== 'clockOut') {
          return { success: false, error: 'Action must be clockIn or clockOut' };
        }

        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Phoenix',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const parts = formatter.formatToParts(now);
        const ye = parts.find(p => p.type === 'year')?.value;
        const mo = parts.find(p => p.type === 'month')?.value;
        const da = parts.find(p => p.type === 'day')?.value;
        const phoenixDate = `${ye}-${mo}-${da}`;

        const existing = await prisma.timeEntry.findUnique({
          where: {
            userId_date: { userId, date: phoenixDate }
          }
        });

        const geoData: any = {
          clockSource: 'ai'
        };

        if (action === 'clockIn') {
          geoData.locationStatus = 'VERIFIED';
          geoData.clockInLocation = 'AI Assistant';
        } else {
          geoData.clockOutLocation = 'AI Assistant';
        }

        if (!existing) {
          if (action === 'clockOut') {
            return { success: false, error: 'No active entry to clock out' };
          }
          const entry = await prisma.timeEntry.create({
            data: {
              userId,
              date: phoenixDate,
              clockIn: now,
              lastActivity: now,
              clockOut: null,
              manualClockIn: now,
              manualClockOut: null,
              ipAddress: 'AI-Internal',
              ...geoData
            }
          });
          return { success: true, action: 'clockIn', time: now.toISOString(), entry };
        }

        const updateData: any = {
          ipAddress: 'AI-Internal',
          ...geoData
        };

        if (action === 'clockIn') {
          updateData.manualClockIn = now;
          updateData.manualClockOut = null;
          updateData.clockOut = null;
          updateData.lastActivity = now;
        } else {
          updateData.manualClockOut = now;
          updateData.clockOut = now;
        }

        const entry = await prisma.timeEntry.update({
          where: { id: existing.id },
          data: updateData
        });

        return { success: true, action, time: now.toISOString(), entry };
      }

      case 'create_task': {
        const { subject, description = '', priority = 'Normal', dueDate, accountName } = args;
        if (!subject) return { success: false, error: 'Subject is required' };

        // Resolve user to get zohoId
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.zohoId) {
          return { success: false, error: 'User does not have a valid Zoho ID linked' };
        }

        const capSubject = subject.charAt(0).toUpperCase() + subject.slice(1);
        const capDesc = description ? description.charAt(0).toUpperCase() + description.slice(1) : "";

        // Resolve Account if provided
        let resolvedAccountId: string | null = null;
        let resolvedAccountZohoId: string | null = null;
        if (accountName) {
          const acc = await prisma.account.findFirst({
            where: { name: { contains: accountName, mode: 'insensitive' } }
          });
          if (acc) {
            resolvedAccountId = acc.id;
            resolvedAccountZohoId = acc.zohoId;
          }
        }

        const token = await getZohoAccessToken();
        const ZOHO_DC = process.env.ZOHO_DC || 'com';

        const taskData: any = {
          Subject: capSubject,
          Status: 'Not Started',
          Priority: priority,
          Owner: { id: user.zohoId }
        };

        if (dueDate) {
          taskData.Due_Date = new Date(dueDate).toISOString().split('T')[0];
        }
        if (capDesc) {
          taskData.Description = capDesc;
        }
        if (resolvedAccountZohoId) {
          taskData.What_Id = { id: resolvedAccountZohoId };
          taskData.$se_module = 'Accounts';
        }

        const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks`, {
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: [taskData] })
        });

        const zohoData = await res.json();
        const recordDetails = zohoData.data?.[0];

        if (!res.ok || recordDetails?.code !== 'SUCCESS') {
          return { success: false, error: 'Failed to create task in Zoho', zohoError: zohoData };
        }

        const newZohoId = recordDetails.details.id;

        // Save locally
        const localTask = await prisma.task.create({
          data: {
            zohoId: newZohoId,
            subject: capSubject,
            description: capDesc || null,
            priority,
            status: 'Not Started',
            dueDate: dueDate ? new Date(dueDate) : null,
            ownerId: user.id,
            accountId: resolvedAccountId,
            type: 'Task'
          }
        });

        return { success: true, task: localTask };
      }

      case 'log_sales_call': {
        const { accountName, outcome, notes = '', durationMinutes = 5 } = args;
        if (!accountName || !outcome) return { success: false, error: 'AccountName and outcome are required' };

        const acc = await prisma.account.findFirst({
          where: { name: { contains: accountName, mode: 'insensitive' } }
        });
        if (!acc) return { success: false, error: `Account matching "${accountName}" not found` };

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return { success: false, error: 'User not found' };

        const outcomeLabels: Record<string, string> = {
          left_voicemail:  "Voicemail Left",
          no_answer:       "No Answer",
          check_in:        "Check-in Call",
          pitch:           "Product Pitch",
          order_placed:    "Order Placed",
          follow_up:       "Follow Up",
          callback_requested: "Callback Requested",
          not_interested:  "Not Interested",
          other:           "Other",
        };

        const noteTitle = `📞 Sales Call — ${outcomeLabels[outcome] || outcome}`;
        const noteContent = `Outcome: ${outcomeLabels[outcome] || outcome}\nDuration: ${durationMinutes} mins\nNotes: ${notes}\nLogged by: ${user.name || user.email}`;

        // Push to Zoho as a note
        try {
          await pushZohoNote(acc.zohoId, noteTitle, noteContent);
        } catch (e: any) {
          console.error('Failed to push note to Zoho:', e);
        }

        // Save locally
        const firstContact = await prisma.contact.findFirst({
          where: { accountId: acc.id }
        });

        const callLog = await prisma.callLog.create({
          data: {
            accountId: acc.id,
            authorId: user.id,
            status: outcomeLabels[outcome] || outcome,
            notes: notes || null,
            direction: 'OUTBOUND',
            fromNumber: user.phone || 'AI-Portal',
            toNumber: firstContact?.phone || 'Unknown',
            duration: durationMinutes * 60
          }
        });

        // Update last called time on account
        await prisma.account.update({
          where: { id: acc.id },
          data: { lastCalledAt: new Date() }
        }).catch(() => null);

        return { success: true, callLog, accountName: acc.name };
      }

      case 'update_account_status_and_quality': {
        const { accountName, status, quality } = args;
        if (!accountName) return { success: false, error: 'AccountName is required' };

        const acc = await prisma.account.findFirst({
          where: { name: { contains: accountName, mode: 'insensitive' } }
        });
        if (!acc) return { success: false, error: `Account matching "${accountName}" not found` };

        const updateData: any = {};
        if (status) updateData.status = status;
        if (quality) updateData.quality = quality;

        if (Object.keys(updateData).length === 0) {
          return { success: false, error: 'Either status or quality must be provided to update' };
        }

        const updatedAcc = await prisma.account.update({
          where: { id: acc.id },
          data: updateData
        });

        // Resolve user to see if they have zohoId
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const token = await getZohoAccessToken();
        const ZOHO_DC = process.env.ZOHO_DC || 'com';

        // Attempt to sync immediately with Zoho CRM
        try {
          const payloadData: any = {
            id: acc.zohoId
          };
          if (status) payloadData.Account_Status = status;
          if (quality) payloadData.Quality = quality;

          await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`, {
            method: 'PUT',
            headers: {
              'Authorization': `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: [payloadData] })
          });
        } catch (e) {
          console.error('Failed to sync account update to Zoho:', e);
        }

        return { success: true, accountName: updatedAcc.name, status: updatedAcc.status, quality: updatedAcc.quality };
      }

      case 'query_communication_history': {
        const { accountName, limit = 10 } = args;
        if (!accountName) return { success: false, error: 'AccountName is required' };

        const acc = await prisma.account.findFirst({
          where: { name: { contains: accountName, mode: 'insensitive' } }
        });
        if (!acc) return { success: false, error: `Account matching "${accountName}" not found` };

        const callLogs = await prisma.callLog.findMany({
          where: { accountId: acc.id },
          take: limit,
          orderBy: { createdAt: 'desc' }
        });

        const smsMessages = await prisma.smsMessage.findMany({
          where: { accountId: acc.id },
          take: limit,
          orderBy: { createdAt: 'desc' }
        });

        const notes = await prisma.note.findMany({
          where: { accountId: acc.id },
          take: limit,
          orderBy: { createdAt: 'desc' }
        });

        // Merge and format history events chronologically
        const history: any[] = [];

        callLogs.forEach(c => {
          history.push({
            type: 'Call Log',
            date: c.createdAt,
            detail: `Call status: ${c.status}. Direction: ${c.direction}. Notes: ${c.notes || 'No call notes'}`
          });
        });

        smsMessages.forEach(s => {
          history.push({
            type: 'SMS Message',
            date: s.createdAt,
            detail: `SMS direction: ${s.direction}. Body: ${s.body}`
          });
        });

        notes.forEach(n => {
          history.push({
            type: 'Account Note',
            date: n.createdAt,
            detail: `Note: ${n.content}`
          });
        });

        // Sort chronologically descending
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
          success: true,
          accountName: acc.name,
          history: history.slice(0, limit)
        };
      }

      case 'draft_message': {
        return { success: true, message: args.messageDraft };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error: any) {
    console.error(`Tool error [${name}]:`, error);
    return { error: error.message || 'An error occurred while executing the tool' };
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_invoices',
      description: 'Query invoices for the user',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['paid', 'unpaid', 'overdue', 'all'] },
          dateFrom: { type: 'string', description: 'ISO date string' },
          dateTo: { type: 'string', description: 'ISO date string' },
          accountName: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_accounts',
      description: 'Search accounts and get basic details',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          status: { type: 'string' },
          quality: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_commissions_summary',
      description: 'Get summary of commissions and sales',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['this_month', 'last_month', 'this_year', 'all'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_payouts',
      description: 'Get recent payouts for the user',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_tasks',
      description: 'Get tasks assigned to the user',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Not Started', 'In Progress', 'Completed', 'all'] },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_rep_stats',
      description: 'Get overall summary statistics for the sales rep',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search the product catalog',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          category: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['search']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_deals',
      description: 'Search deals (opportunities)',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string' },
          accountName: { type: 'string' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_sales_orders',
      description: 'Search sales orders',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_collections',
      description: 'Get overdue/unpaid invoices for collections follow-up',
      parameters: {
        type: 'object',
        properties: {
          minDaysOverdue: { type: 'number' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_time_entries',
      description: 'Get time clock entries',
      parameters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_vig_goals',
      description: 'Get VIG rate goals and performance',
      parameters: {
        type: 'object',
        properties: {
          monthKey: { type: 'string', description: 'YYYY-MM format' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_leads',
      description: 'Search leads',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          disposition: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_advances',
      description: 'Get outstanding salary advances and payback status',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_company_summary',
      description: 'Get company-wide sales summary — available to all users',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['this_month', 'last_month', 'this_year'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_users',
      description: 'List all sales reps and their current month stats (ADMIN ONLY)',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_timeclock',
      description: 'Clock the current user in or out of their shift',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['clockIn', 'clockOut'], description: 'Whether to clock in or clock out' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task, callback reminder, or check-in request',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'The subject/title of the task' },
          description: { type: 'string', description: 'Detailed description or notes for the task' },
          priority: { type: 'string', enum: ['High', 'Normal', 'Low'], description: 'Task priority level' },
          dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
          accountName: { type: 'string', description: 'Name of the account to link this task to (optional)' }
        },
        required: ['subject']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_sales_call',
      description: 'Log details of a customer sales call, including outcome and notes',
      parameters: {
        type: 'object',
        properties: {
          accountName: { type: 'string', description: 'Name of the account called' },
          outcome: { type: 'string', enum: ['left_voicemail', 'no_answer', 'pitch', 'check_in', 'order_placed', 'follow_up', 'callback_requested', 'not_interested', 'other'], description: 'The outcome status of the call' },
          notes: { type: 'string', description: 'Call note details' },
          durationMinutes: { type: 'number', description: 'Call duration in minutes' }
        },
        required: ['accountName', 'outcome']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_account_status_and_quality',
      description: 'Update the relationship status or quality rating tier of a customer account',
      parameters: {
        type: 'object',
        properties: {
          accountName: { type: 'string', description: 'Name of the account' },
          status: { type: 'string', enum: ['Personal', 'Open', 'Update Status', 'Inactive', 'VIP', 'New Lead', 'Hot Lead', 'Do Not Contact', 'DNR'], description: 'The new relationship status' },
          quality: { type: 'string', enum: ['HOT', 'WARM', 'COLD', 'ON_HOLD', 'DO_NOT_CALL', 'NEVER_STATUSED'], description: 'The new quality rating tier' }
        },
        required: ['accountName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_communication_history',
      description: 'Fetch SMS messages, call logs, and notes for an account to see past touchpoints',
      parameters: {
        type: 'object',
        properties: {
          accountName: { type: 'string', description: 'Name of the account' },
          limit: { type: 'number', description: 'Maximum number of history events to retrieve' }
        },
        required: ['accountName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'draft_message',
      description: 'Draft a message based on the data retrieved (optional helper)',
      parameters: {
        type: 'object',
        properties: {
          messageDraft: { type: 'string' }
        },
        required: ['messageDraft']
      }
    }
  }
] as const;


export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let dbUser = null;
  let allToolNames: string[] = [];

  try {
    const body = await req.json();
    const { message, context, conversationHistory = [] } = body;
    const { userId, userRole } = context || {};

    if (!message || !userId) {
      return NextResponse.json({ success: false, error: 'Missing message or userId' }, { status: 400 });
    }

    if (!checkRateLimit(userId)) {
      return NextResponse.json({ success: false, error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }

    dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { zohoId: userId }
        ]
      }
    });
    if (!dbUser) {
      return NextResponse.json({ success: false, error: `User not found for ID: ${userId}` }, { status: 404 });
    }

    const actualRole = dbUser.role || userRole;
    const admin = isAdmin(actualRole);
    const roleNote = admin 
      ? "You have full admin access to all data across all reps."
      : "You can view your own accounts, invoices, commissions, and tasks. You can also see company-wide aggregate totals but not other individual reps' data.";

    const now = new Date();
    const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' });
    const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' });

    const systemPrompt = `You are Titan AI, the intelligent data assistant for Titan Diamond USA's sales platform.
You have full access to the company's database and can answer questions about sales, invoices, commissions, accounts, deals, products, tasks, shipping, time tracking, VIG rates, leads, advances, and more.

TODAY'S DATE: ${currentDate} at ${currentTime} (Phoenix, AZ time)
Current user: ${dbUser.name || 'Unknown'} (Role: ${actualRole})
${roleNote}

IMPORTANT RULES:
- Be concise, professional, and data-driven
- Format currency with $ and 2 decimal places
- Format dates in readable format (e.g. "Aug 13, 2026")
- When showing lists, use clean formatting with line breaks
- If no data is found, say so clearly — do NOT make up or guess data
- If a query fails, explain what went wrong
- When showing financial summaries, always include invoice count
- For commission calculations, use the real computedProfit, computedUpfront, and computedFinal values from invoices — never approximate
- Always use the tools to query real data — never guess or hallucinate numbers
`;

    const client = getOpenAIClient();

    // Include recent conversation history for context
    const historyMessages = conversationHistory.slice(-20).map((m: any) => ({
      role: m.role,
      content: m.content
    }));

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message }
    ];

    let finalResponse = '';
    const maxRounds = 5;
    
    for (let round = 0; round < maxRounds; round++) {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: TOOLS as any,
        tool_choice: 'auto'
      });

      const responseMessage = response.choices[0].message;
      messages.push(responseMessage);

      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        finalResponse = responseMessage.content || '';
        break;
      }

      for (const toolCall of responseMessage.tool_calls) {
        if (!('function' in toolCall)) continue;
        const fnToolCall = toolCall as any;
        const functionName = fnToolCall.function.name;
        allToolNames.push(functionName);
        
        let functionArgs = {};
        try {
          functionArgs = JSON.parse(fnToolCall.function.arguments);
        } catch (e) {
          console.error(`Failed to parse arguments for ${functionName}`);
        }

        const toolResult = await executeTool(functionName, functionArgs, {
          userId: dbUser.id,
          userRole: actualRole,
          userName: dbUser.name || 'Unknown'
        });

        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: JSON.stringify(toolResult)
        });
      }
    }

    if (!finalResponse) {
      finalResponse = "I have completed the data gathering but failed to generate a final response.";
    }

    // Log the Q&A to AiChatLog for cataloging
    const toolsUsedStr = [...new Set(allToolNames)].join(', ');
    let logId: string | null = null;
    try {
      const logEntry = await prisma.aiChatLog.create({
        data: {
          userId: dbUser.id,
          userRole: actualRole,
          question: message,
          answer: finalResponse,
          toolsUsed: toolsUsedStr || null,
          responseTimeMs: Date.now() - startTime,
        }
      });
      logId = logEntry.id;
    } catch (e) {
      console.error('Failed to log AI chat:', e);
    }

    return NextResponse.json({
      success: true,
      response: finalResponse,
      logId,
    });
  } catch (error: any) {
    console.error('AI Chat Error:', error?.message || error);
    
    const errMsg = error?.message || '';

    if (errMsg.includes('OPENAI_API_KEY') || errMsg.includes('API key')) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI API key is not configured. Please add OPENAI_API_KEY to your Netlify environment variables.'
      }, { status: 500 });
    }

    // OpenAI errors (rate limit, quota, auth)
    if (error?.status === 401 || errMsg.includes('Incorrect API key')) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI API key is invalid or expired. Please check your OPENAI_API_KEY.'
      }, { status: 500 });
    }

    if (error?.status === 429) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI rate limit reached. Please try again in a moment.'
      }, { status: 429 });
    }

    if (error?.status === 402 || errMsg.includes('quota') || errMsg.includes('billing')) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI billing quota exceeded. Please check your OpenAI account billing.'
      }, { status: 500 });
    }

    // Prisma / DB errors
    if (errMsg.includes('prisma') || errMsg.includes('PrismaClient') || errMsg.includes('connect')) {
      return NextResponse.json({
        success: false,
        error: 'Database connection error. The system will retry automatically.'
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: false,
      error: `An error occurred: ${errMsg.substring(0, 120) || 'Unknown error'}`
    }, { status: 500 });
  }
}

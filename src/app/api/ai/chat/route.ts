import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
  return _openai;
}

// Simple in-memory rate limiting
const rateLimits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimits.get(userId) || [];
  
  // Filter out timestamps older than the window
  const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
  
  if (validTimestamps.length >= MAX_REQUESTS) {
    return false;
  }
  
  validTimestamps.push(now);
  rateLimits.set(userId, validTimestamps);
  
  // Cleanup old entries periodically to prevent memory leaks in a real app,
  // but for simple in-memory this suffices for a single instance.
  return true;
}

const SYSTEM_PROMPT = `You are Titan AI, the intelligent assistant for Titan Diamond USA's sales platform. You have full access to the company's database and can answer questions about:
- Sales performance, invoices, commissions, payouts
- Account details, contact information
- Tasks and follow-ups
- Products and catalog
- Shipping status
- Time tracking
- VIG rates and goals

Be concise, professional, and data-driven. Format currency with $ and 2 decimal places. When referencing dates, use readable formats.`;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: 'OpenAI API key is missing' }, { status: 500 });
    }

    const body = await req.json();
    const { message, context, conversationHistory = [] } = body;

    const userId = context?.userId || 'anonymous';
    if (!checkRateLimit(userId)) {
      return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    if (!message) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    const tools: any[] = [
      {
        type: 'function',
        function: {
          name: 'query_invoices',
          description: 'Query invoices for an account or sales rep',
          parameters: {
            type: 'object',
            properties: {
              repId: { type: 'string' },
              accountId: { type: 'string' },
              status: { type: 'string', enum: ['paid', 'unpaid', 'all'] },
              dateFrom: { type: 'string', description: 'ISO date string' },
              dateTo: { type: 'string', description: 'ISO date string' },
              limit: { type: 'number' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'query_accounts',
          description: 'Search accounts by name',
          parameters: {
            type: 'object',
            properties: {
              search: { type: 'string' },
              repId: { type: 'string' },
              limit: { type: 'number' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'query_commissions_summary',
          description: 'Get a summary of commissions for a sales rep',
          parameters: {
            type: 'object',
            properties: {
              repId: { type: 'string' },
              period: { type: 'string', enum: ['this_month', 'last_month', 'this_year', 'all'] }
            },
            required: ['repId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'query_payouts',
          description: 'Get recent commission payouts for a rep',
          parameters: {
            type: 'object',
            properties: {
              repId: { type: 'string' },
              limit: { type: 'number' }
            },
            required: ['repId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'query_tasks',
          description: 'Get tasks for a rep',
          parameters: {
            type: 'object',
            properties: {
              repId: { type: 'string' },
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
          description: 'Get overall stats for a sales rep',
          parameters: {
            type: 'object',
            properties: {
              repId: { type: 'string' }
            },
            required: ['repId']
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
          name: 'draft_message',
          description: 'Draft a message or email (does not send it)',
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              subject: { type: 'string' },
              body: { type: 'string' },
              tone: { type: 'string', enum: ['professional', 'friendly', 'urgent'] }
            },
            required: ['to', 'body']
          }
        }
      }
    ];

    let rounds = 0;
    const maxRounds = 3;
    let finalResponse = null;

    while (rounds < maxRounds) {
      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools,
        tool_choice: 'auto',
      });

      const responseMessage = response.choices[0].message;
      messages.push(responseMessage);

      if (responseMessage.tool_calls) {
        for (const toolCall of responseMessage.tool_calls) {
          const tc = toolCall as any;
          if (!tc.function) continue;
          const functionName = tc.function.name;
          const args = JSON.parse(tc.function.arguments);
          let functionResult: any = null;

          try {
            switch (functionName) {
              case 'query_invoices': {
                const { repId, accountId, status, dateFrom, dateTo, limit } = args;
                const where: any = {};
                // If repId is provided, we might need to find their accounts first
                if (repId) {
                  // Assuming user has accounts
                  const userAccounts = await prisma.account.findMany({ where: { ownerId: repId }, select: { id: true } });
                  where.accountId = { in: userAccounts.map((a: any) => a.id) };
                }
                if (accountId) where.accountId = accountId;
                if (status === 'paid') where.status = { in: ['paid', 'Paid'] };
                if (status === 'unpaid') where.status = { notIn: ['paid', 'Paid', 'Void', 'void'] };
                
                if (dateFrom || dateTo) {
                  where.issueDate = {};
                  if (dateFrom) where.issueDate.gte = new Date(dateFrom);
                  if (dateTo) where.issueDate.lte = new Date(dateTo);
                }

                const invoices = await prisma.invoice.findMany({
                  where,
                  take: limit || 20,
                  orderBy: { issueDate: 'desc' },
                  include: { account: { select: { name: true } } }
                });

                functionResult = invoices.map((i: any) => ({
                  id: i.id,
                  invoiceNumber: i.items?.invoice_number || i.id, // Fallback to id if no invoice_number
                  amount: i.amount,
                  status: i.status,
                  issueDate: i.issueDate,
                  accountName: i.account?.name
                }));
                break;
              }
              case 'query_accounts': {
                const { search, repId, limit } = args;
                const where: any = {};
                if (search) where.name = { contains: search, mode: 'insensitive' };
                if (repId) where.ownerId = repId;
                
                const accounts = await prisma.account.findMany({
                  where,
                  take: limit || 10,
                  include: { invoices: { orderBy: { issueDate: 'desc' } } }
                });

                functionResult = accounts.map((a: any) => ({
                  name: a.name,
                  phone: a.phone,
                  email: a.email,
                  totalInvoicesCount: a.invoices.length,
                  lastInvoiceDate: a.invoices.length > 0 ? a.invoices[0].issueDate : null
                }));
                break;
              }
              case 'query_commissions_summary': {
                const { repId, period } = args;
                
                const where: any = {};
                // Assume all accounts for repId
                const repAccounts = await prisma.account.findMany({ where: { ownerId: repId }, select: { id: true } });
                where.accountId = { in: repAccounts.map((a: any) => a.id) };
                
                if (period === 'this_month') {
                  const now = new Date();
                  where.issueDate = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
                } else if (period === 'last_month') {
                  const now = new Date();
                  where.issueDate = { 
                    gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
                    lt: new Date(now.getFullYear(), now.getMonth(), 1)
                  };
                } else if (period === 'this_year') {
                  const now = new Date();
                  where.issueDate = { gte: new Date(now.getFullYear(), 0, 1) };
                }

                const invoices = await prisma.invoice.findMany({ where });
                
                let totalEarned = 0;
                let totalPending = 0;
                
                for (const inv of invoices) {
                  // Approximate commission (50% of profit after VIG - simplified)
                  const comm = (inv.amount || 0) * 0.1; // Simple fallback approximation if real profit isn't easily calculable
                  
                  if (inv.status?.toLowerCase() === 'paid') {
                    totalEarned += comm;
                  } else if (inv.status?.toLowerCase() !== 'void') {
                    totalPending += comm;
                  }
                }

                const totalInvoices = invoices.length;
                const avgDealSize = totalInvoices > 0 ? invoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0) / totalInvoices : 0;

                functionResult = {
                  totalEarned,
                  totalPending,
                  invoiceCount: totalInvoices,
                  avgDealSize
                };
                break;
              }
              case 'query_payouts': {
                const { repId, limit } = args;
                const payouts = await prisma.payout.findMany({
                  where: { repId: repId },
                  take: limit || 10,
                  orderBy: { date: 'desc' }
                });
                functionResult = payouts.map((p: any) => ({
                  date: p.date,
                  amount: p.amount,
                  method: p.method,
                  notes: p.notes
                }));
                break;
              }
              case 'query_tasks': {
                const { repId, status, limit } = args;
                const where: any = {};
                if (repId) where.ownerId = repId;
                if (status && status !== 'all') where.status = status;
                
                const tasks = await prisma.task.findMany({
                  where,
                  take: limit || 20,
                  orderBy: { dueDate: 'asc' },
                  include: { account: { select: { name: true } } }
                });

                functionResult = tasks.map((t: any) => ({
                  subject: t.subject,
                  status: t.status,
                  priority: t.priority,
                  dueDate: t.dueDate,
                  accountName: t.account?.name
                }));
                break;
              }
              case 'query_rep_stats': {
                const { repId } = args;
                const [accountsCount, invoicesCount] = await Promise.all([
                  prisma.account.count({ where: { ownerId: repId } }),
                  prisma.invoice.count({ 
                    where: { 
                      account: { ownerId: repId },
                      status: { notIn: ['paid', 'Void', 'void'] }
                    } 
                  })
                ]);
                
                const now = new Date();
                const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                
                const [thisMonthInvoices, lastMonthInvoices] = await Promise.all([
                  prisma.invoice.findMany({
                    where: { account: { ownerId: repId }, issueDate: { gte: thisMonthStart } }
                  }),
                  prisma.invoice.findMany({
                    where: { account: { ownerId: repId }, issueDate: { gte: lastMonthStart, lt: thisMonthStart } }
                  })
                ]);
                
                const thisMonthSales = thisMonthInvoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                const lastMonthSales = lastMonthInvoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                
                const pendingTasksCount = await prisma.task.count({
                  where: { ownerId: repId, status: { notIn: ['Completed'] } }
                });

                // Assuming a TimeEntry model exists
                const latestTimeEntry = await prisma.timeEntry.findFirst({
                  where: { userId: repId },
                  orderBy: { clockIn: 'desc' }
                });
                
                functionResult = {
                  totalAccountsCount: accountsCount,
                  activeInvoicesCount: invoicesCount,
                  thisMonthSalesTotal: thisMonthSales,
                  lastMonthSalesTotal: lastMonthSales,
                  pendingTasksCount,
                  clockStatus: latestTimeEntry ? (latestTimeEntry.clockOut ? 'Clocked Out' : 'Clocked In') : 'Unknown'
                };
                break;
              }
              case 'search_products': {
                const { search, category, limit } = args;
                const where: any = {
                  name: { contains: search, mode: 'insensitive' }
                };
                if (category) where.category = { contains: category, mode: 'insensitive' };
                
                const products = await prisma.product.findMany({
                  where,
                  take: limit || 10
                });

                functionResult = products.map((p: any) => ({
                  name: p.name,
                  sku: p.sku,
                  price: p.price,
                  category: p.category,
                  inStock: p.stock > 0
                }));
                break;
              }
              case 'draft_message': {
                const { to, subject, body, tone } = args;
                functionResult = {
                  drafted: true,
                  to,
                  subject: subject || 'No Subject',
                  body,
                  tone: tone || 'professional',
                  note: 'This message has been drafted but not sent. User must review and send manually.'
                };
                break;
              }
              default:
                functionResult = { error: 'Unknown tool call' };
            }
          } catch (dbError: any) {
            console.error('Database error in tool call:', dbError);
            functionResult = { error: 'Failed to query database.' };
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(functionResult)
          } as any);
        }
        rounds++;
      } else {
        // Final response
        finalResponse = responseMessage.content;
        break;
      }
    }

    if (!finalResponse) {
      finalResponse = "I'm sorry, I couldn't process your request completely.";
    }

    return NextResponse.json({
      success: true,
      response: finalResponse
    });

  } catch (error: any) {
    console.error('AI Chat Error:', error);
    return NextResponse.json({
      success: false,
      error: 'An error occurred while processing the chat request.'
    }, { status: 500 });
  }
}

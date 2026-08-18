import { prisma } from '@/lib/prisma';
import { handler } from "../../../../netlify/functions/zoho-update-line-items";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
;

async function executeNetlifyFunction(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = (session?.user as any)?.role || "Sales Representative"
    const isAdmin = role.toLowerCase().includes("admin")

    if (req.method === 'POST') {
      const bodyText = await req.text()
      let body: any = {}
      try {
        body = JSON.parse(bodyText)
      } catch (e) {}

      const documentId = body.zohoId || body.documentId
      const type = body.type || "Invoice"

      if (!documentId) {
        return NextResponse.json({ error: "Missing documentId" }, { status: 400 })
      }

      // 1. Resolve document details locally to verify salesperson/owner permissions
      let dbDoc: any = null
      if (type === "Invoice") {
        dbDoc = await prisma.invoice.findFirst({ where: { OR: [{ id: documentId }, { zohoId: documentId }] } })
      } else if (type === "SalesOrder") {
        dbDoc = await prisma.salesOrder.findFirst({ where: { OR: [{ id: documentId }, { zohoId: documentId }] } })
      } else if (type === "Quote") {
        dbDoc = await prisma.quote.findFirst({ where: { OR: [{ id: documentId }, { zohoId: documentId }] } })
      }

      const docItems = dbDoc ? (dbDoc.items as any || {}) : {}
      const spName = (docItems.salesperson || "").toLowerCase().trim()

      let matchedRep: any = null
      if (spName) {
        matchedRep = await prisma.user.findFirst({
          where: {
            name: { equals: spName, mode: 'insensitive' }
          }
        })
      }

      const isSalespersonOwner = 
        spName && 
        ((matchedRep && matchedRep.email?.toLowerCase().trim() === session.user?.email?.toLowerCase().trim()) || 
         (spName === session.user?.name?.toLowerCase().trim()))

      const isSalesOrderInvoiced = 
        type === "SalesOrder" && 
        (dbDoc?.status?.toLowerCase() === "invoiced" || 
         docItems.invoiced === true || 
         (docItems.invoices && docItems.invoices.length > 0))

      const canEdit = isAdmin || (isSalespersonOwner && type === "SalesOrder" && !isSalesOrderInvoiced)

      if (!canEdit) {
        return NextResponse.json({ error: "Forbidden: You do not have permission to edit this document" }, { status: 403 })
      }

      // Forward request to Netlify handler
      const url = new URL(req.url);
      const event = {
        path: url.pathname,
        httpMethod: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        queryStringParameters: Object.fromEntries(url.searchParams.entries()),
        body: bodyText,
        isBase64Encoded: false,
      };

      const context = {};
      const result: any = await handler(event as any, context as any);
      
      return new NextResponse(result.body || '', {
        status: result.statusCode || 200,
        headers: result.headers || { 'Content-Type': 'application/json' },
      });
    }

    // Default proxy logic for options and non-POST actions
    const url = new URL(req.url);
    const event = {
      path: url.pathname,
      httpMethod: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: null,
      isBase64Encoded: false,
    };

    const context = {};
    const result: any = await handler(event as any, context as any);
    return new NextResponse(result.body || '', {
      status: result.statusCode || 200,
      headers: result.headers || { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error executing zoho-update-line-items:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return executeNetlifyFunction(req); }
export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function PUT(req: NextRequest) { return executeNetlifyFunction(req); }
export async function DELETE(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }

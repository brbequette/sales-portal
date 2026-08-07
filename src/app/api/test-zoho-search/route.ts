import { NextResponse } from "next/server";
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from "../../../../netlify/functions/lib/zoho-auth";

export async function GET() {
  try {
    const t = await getZohoAccessToken();
    const org1 = ZOHO_ORGANIZATION_ID;
    const org2 = "846879854"; // Legacy secondary org ID (kept for manual testing)
    
    const url1 = `https://www.zohoapis.com/books/v3/organizations`;
    const res1 = await fetch(url1, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    const data1 = await res1.json();

    const url2 = `https://www.zohoapis.com/books/v3/invoices?organization_id=${org1}&invoice_number=8189`;
    const res2 = await fetch(url2, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    const data2 = await res2.json();

    const pdfUrl = `https://www.zohoapis.com/books/v3/invoices/1254360000018829558?organization_id=${org1}&accept=pdf`;
    const resPdf = await fetch(pdfUrl, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    const pdfStatus = resPdf.status;
    const pdfData = await resPdf.text();

    return NextResponse.json({ 
      organizationsList: data1, 
      invoicesOrg1: data2, 
      pdfStatus,
      pdfData: pdfData.substring(0, 100)
    });
  } catch(e: any) {
    return NextResponse.json({ error: e.message });
  }
}

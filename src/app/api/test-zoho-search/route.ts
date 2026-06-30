import { NextResponse } from "next/server";
import { getZohoAccessToken } from "../../../../netlify/functions/lib/zoho-auth";

export async function GET() {
  try {
    const t = await getZohoAccessToken();
    const org1 = "664670946";
    const org2 = "846879854";
    
    const url1 = `https://www.zohoapis.com/books/v3/organizations`;
    const res1 = await fetch(url1, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    const data1 = await res1.json();

    const url2 = `https://www.zohoapis.com/books/v3/invoices?organization_id=${org1}&invoice_number=8189`;
    const res2 = await fetch(url2, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    const data2 = await res2.json();

    const url3 = `https://www.zohoapis.com/books/v3/invoices?organization_id=${org2}&invoice_number=8189`;
    const res3 = await fetch(url3, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    const data3 = await res3.json();

    return NextResponse.json({ 
      organizationsList: data1, 
      invoicesOrg1: data2, 
      invoicesOrg2: data3 
    });
  } catch(e: any) {
    return NextResponse.json({ error: e.message });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { requireAdministrator } from '@/lib/auth-helpers';

export async function POST() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const filePath = process.env.VENDOR_CSV_PATH;

    if (!filePath) {
      return NextResponse.json({ error: 'VENDOR_CSV_PATH is not configured' }, { status: 503 });
    }
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Vendor CSV file not found' }, { status: 404 });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    });

    let upsertCount = 0;

    for (const record of records as any[]) {
      const zohoId = record['Contact ID'];
      if (!zohoId) continue;

      const contactName = record['Contact Name'] || null;
      const companyName = record['Company Name'] || null;
      const email = record['EmailID'] || null;
      const phone = record['Phone'] || null;
      const currencyId = record['Currency Code'] || null;
      const status = (record['Status'] || 'Active').toLowerCase();
      
      const paymentTermsRaw = record['Payment Terms'];
      let paymentTerms = 0;
      if (paymentTermsRaw && !isNaN(parseInt(paymentTermsRaw))) {
        paymentTerms = parseInt(paymentTermsRaw);
      }

      const billingAddress = {
        street: record['Billing Address'],
        street2: record['Billing Street2'],
        city: record['Billing City'],
        state: record['Billing State'],
        zip: record['Billing Code'],
        country: record['Billing Country']
      };

      const shippingAddress = {
        street: record['Shipping Address'],
        street2: record['Shipping Street2'],
        city: record['Shipping City'],
        state: record['Shipping State'],
        zip: record['Shipping Code'],
        country: record['Shipping Country']
      };

      await prisma.vendor.upsert({
        where: { zohoId },
        create: {
          zohoId,
          contactName,
          companyName,
          email,
          phone,
          currencyId,
          paymentTerms,
          billingAddress,
          shippingAddress,
          status,
        },
        update: {
          contactName,
          companyName,
          email,
          phone,
          currencyId,
          paymentTerms,
          billingAddress,
          shippingAddress,
          status,
        }
      });
      
      upsertCount++;
    }

    return NextResponse.json({ success: true, upserted: upsertCount });
  } catch (error: any) {
    console.error('Error syncing vendors:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

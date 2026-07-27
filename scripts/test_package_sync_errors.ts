import { prisma } from '../src/lib/prisma';
import { getZohoAccessToken } from '../src/lib/zoho-auth';

async function main() {
  const token = await getZohoAccessToken();
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

  console.log('Fetching packages from Zoho Books...');
  const res = await fetch(`https://www.zohoapis.com/books/v3/packages?organization_id=${ORG_ID}&page=1&per_page=200`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });

  const data = await res.json();
  const packages = data.packages || [];
  console.log(`Found ${packages.length} packages on page 1.`);

  let created = 0, updated = 0, errors = 0;

  for (const pkg of packages) {
    try {
      const zohoId = String(pkg.package_id);
      if (!zohoId) continue;

      const packageData: any = {
        zohoId,
        packageNumber: pkg.package_number || null,
        salesOrderId: pkg.salesorder_id ? String(pkg.salesorder_id) : null,
        salesOrderNumber: pkg.salesorder_number ? String(pkg.salesorder_number) : null,
        date: pkg.date ? new Date(pkg.date) : null,
        status: pkg.status || null,
        carrier: pkg.delivery_method || pkg.shipping_carrier || null,
        trackingNumber: pkg.tracking_number || null,
        shippingCharge: parseFloat(pkg.shipping_charge) || 0,
        items: pkg.line_items ? { lineItems: pkg.line_items } : undefined,
      };

      const existing = await prisma.package.findUnique({ where: { zohoId } });
      if (existing) {
        await prisma.package.update({ where: { zohoId }, data: packageData });
        updated++;
      } else {
        await prisma.package.create({ data: packageData });
        created++;
      }
    } catch (e: any) {
      console.error(`Package error for pkg ${pkg.package_number}:`, e.message);
      errors++;
    }
  }

  console.log({ created, updated, errors });
  process.exit(0);
}

main().catch(console.error);

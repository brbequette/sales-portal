const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("=== Fixing Sales Rep Emails and Merging Accounts ===");

    // 1. Clean up duplicate mock 'monty' user (email: monty@titandiamond.net, zohoId: mock-zoho-...)
    const mockMonty = await prisma.user.findFirst({
      where: {
        email: 'monty@titandiamond.net',
        zohoId: { startsWith: 'mock-zoho' }
      }
    });

    if (mockMonty) {
      console.log(`Found duplicate mock Monty user (ID: ${mockMonty.id}). Deleting to free up email...`);
      await prisma.user.delete({
        where: { id: mockMonty.id }
      });
      console.log("Mock user deleted.");
    }

    // 2. Update real Montgomery Morgan's email to monty@titandiamond.net
    const realMonty = await prisma.user.findUnique({
      where: { zohoId: '6821836000000617001' }
    });

    if (realMonty) {
      console.log(`Updating Montgomery Morgan (zohoId: 6821836000000617001) email to 'monty@titandiamond.net'...`);
      await prisma.user.update({
        where: { zohoId: '6821836000000617001' },
        data: { email: 'monty@titandiamond.net' }
      });
      console.log("Montgomery Morgan updated successfully.");
    } else {
      console.log("Real Montgomery Morgan user record not found by Zoho ID.");
    }

    // 3. Clean up duplicate mock 'richard' user if exists
    const mockRichard = await prisma.user.findFirst({
      where: {
        email: 'richard@titandiamond.net',
        zohoId: { startsWith: 'mock-zoho' }
      }
    });

    if (mockRichard) {
      console.log(`Found duplicate mock Richard user. Deleting to free up email...`);
      await prisma.user.delete({
        where: { id: mockRichard.id }
      });
    }

    // 4. Update real Richard Griffin's email to richard@titandiamond.net
    const realRichard = await prisma.user.findUnique({
      where: { zohoId: '6821836000000636001' }
    });

    if (realRichard) {
      console.log(`Updating Richard Griffin (zohoId: 6821836000000636001) email to 'richard@titandiamond.net'...`);
      await prisma.user.update({
        where: { zohoId: '6821836000000636001' },
        data: { email: 'richard@titandiamond.net' }
      });
      console.log("Richard Griffin updated successfully.");
    }

    console.log("\nDone cleaning up and linking user accounts!");

  } catch (err) {
    console.error("Error updating user emails:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

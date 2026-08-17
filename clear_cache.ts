import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  try {
    console.log("Connecting to database to clear Zoho token cache...");
    const result = await prisma.systemSetting.deleteMany({
      where: {
        key: "zoho_token_cache"
      }
    });
    console.log(`Successfully cleared Zoho token cache. Deleted rows: ${result.count}`);
    console.log("Please restart your local server and try again!");
  } catch (e: any) {
    console.error("Failed to clear database cache:", e.message);
  } finally {
    await prisma.$disconnect()
  }
}
main()

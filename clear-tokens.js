const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.systemSetting.deleteMany({
      where: {
        key: {
          in: ['zoho_access_token', 'zoho_token_expires_at']
        }
      }
    });
    console.log('Tokens cleared');
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();

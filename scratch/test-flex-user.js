const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findUserFlexibly(emailOrInput, zohoUserId) {
  if (zohoUserId) {
    const userByZohoId = await prisma.user.findFirst({
      where: { zohoId: String(zohoUserId) }
    }).catch(() => null);
    if (userByZohoId) return userByZohoId;
  }

  const cleanInput = (emailOrInput || '').trim().toLowerCase();
  if (!cleanInput) return null;

  let user = await prisma.user.findUnique({
    where: { email: cleanInput }
  }).catch(() => null);
  if (user) return user;

  user = await prisma.user.findFirst({
    where: { email: { equals: cleanInput, mode: 'insensitive' } }
  }).catch(() => null);
  if (user) return user;

  const prefix = cleanInput.split('@')[0];
  const nameParts = prefix.split(/[._\s-]+/).filter(Boolean);

  const candidateUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: prefix, mode: 'insensitive' } },
        ...nameParts.map(part => ({ name: { contains: part, mode: 'insensitive' } })),
        ...nameParts.map(part => ({ email: { contains: part, mode: 'insensitive' } })),
      ]
    }
  }).catch(() => []);

  if (candidateUsers.length > 0) {
    const exactNameMatch = candidateUsers.find(u => {
      const uName = ((u.name || '') + ' ' + (u.email || '')).toLowerCase();
      return nameParts.every(p => uName.includes(p));
    });
    if (exactNameMatch) return exactNameMatch;
    return candidateUsers[0];
  }

  return null;
}

async function test() {
  const inputs = [
    'ross@titandiamond.net',
    'ross@titandiamondusa.com',
    'ross.haisler@titandiamondusa.com',
    'ross.heisler@titandiamondusa.com',
    'ross.haisler@titandiamond.net',
    'ross',
    'ross.haisler'
  ];

  for (const input of inputs) {
    const match = await findUserFlexibly(input, '6821836000000656001');
    console.log(`Input: "${input}" => Found: "${match?.name}" (${match?.email}, ID: ${match?.id})`);
  }

  await prisma.$disconnect();
}

test();

/**
 * seed-admin-settings.ts
 *
 * One-time seed: populates the SystemSetting entries that replaced the
 * hard-coded email/role overrides removed from get-accounts.ts.
 *
 * Run:
 *   npx ts-node scripts/seed-admin-settings.ts
 *
 * These values replicate what was previously hard-coded.
 * Edit via the admin panel or DB query to update without a code deploy.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // Email alias map: maps login email to primary account email
  // Previously: "admin@titandiamond.com" was remapped to "ben@titandiamond.net"
  await prisma.systemSetting.upsert({
    where:  { key: "admin_email_aliases" },
    update: { value: JSON.stringify({ "admin@titandiamond.com": "ben@titandiamond.net" }) },
    create: { key: "admin_email_aliases", value: JSON.stringify({ "admin@titandiamond.com": "ben@titandiamond.net" }) },
  })

  // Admin email patterns: comma-separated substrings; any user whose email
  // contains one of these is auto-elevated to Administrator role.
  // Previously: "ben", "monty", "bequette", "morgan"
  await prisma.systemSetting.upsert({
    where:  { key: "admin_email_patterns" },
    update: { value: "ben,monty,bequette,morgan" },
    create: { key: "admin_email_patterns", value: "ben,monty,bequette,morgan" },
  })

  console.log("Seeded admin_email_aliases and admin_email_patterns successfully.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

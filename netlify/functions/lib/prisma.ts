import { PrismaClient } from '@prisma/client'

const dbUrl = process.env.DATABASE_URL || "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: dbUrl } },
    log: ['error']
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma


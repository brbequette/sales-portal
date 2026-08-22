import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAdminRole } from "@/lib/roles"

export async function getAuthenticatedDbUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        session.user.dbId ? { id: session.user.dbId } : undefined,
        session.user.id ? { id: session.user.id } : undefined,
        session.user.email ? { email: { equals: session.user.email, mode: "insensitive" } } : undefined,
      ].filter(Boolean) as any,
    },
  })

  if (!user) return null
  return { session, user, isAdmin: isAdminRole(user.role) }
}

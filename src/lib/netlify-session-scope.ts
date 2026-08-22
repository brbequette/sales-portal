import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { isAdminRole } from "@/lib/roles"

type ScopeOptions = {
  forceRepScope?: boolean
  forceOwnerScope?: boolean
}

export async function getSessionScopedNetlifyUrl(req: NextRequest, options: ScopeOptions = {}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return {
      url: null,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const email = session.user.email
  const user = session.user as typeof session.user & { dbId?: string; id?: string; role?: string }
  const identityId = user.dbId || user.id || ""
  const role = user.role || ""
  const url = new URL(req.url)

  // Identity parameters are always server-owned. Never trust browser values.
  url.searchParams.set("email", email)
  url.searchParams.set("userEmail", email)
  url.searchParams.set("role", role)
  url.searchParams.set("zohoId", user.id || identityId)
  url.searchParams.set("userId", identityId)

  if (!isAdminRole(role)) {
    if (options.forceRepScope) url.searchParams.set("repId", identityId)
    if (options.forceOwnerScope) url.searchParams.set("ownerIdFilter", identityId)
  }

  return { url, errorResponse: null }
}

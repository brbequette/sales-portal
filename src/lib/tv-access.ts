import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "./auth"
import { isAdministratorRole } from "./roles"
import { hasValidTvSession } from "./tv-auth"

export type TvAccess = "administrator" | "display"
export type TvSession = { user?: { name?: string | null; role?: string | null } } | null

export async function requireTvAccess(): Promise<{ access: TvAccess | null; session: TvSession; errorResponse: NextResponse | null }> {
  const session = await getServerSession(authOptions)
  if (session?.user && isAdministratorRole(session.user.role)) return { access: "administrator", session: session as TvSession, errorResponse: null }
  if (await hasValidTvSession()) return { access: "display", session: null, errorResponse: null }
  return { access: null, session: null, errorResponse: NextResponse.json({ error: "TV authorization required" }, { status: 401 }) }
}

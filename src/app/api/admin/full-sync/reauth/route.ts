import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "node:crypto"
import bcrypt from "bcryptjs"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ""
function sign(value: string) { return createHmac("sha256", secret).update(value).digest("hex") }

export async function POST(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const { password } = await req.json().catch(() => ({}))
  const actorId = auth.session?.user?.dbId || auth.session?.user?.id
  if (!actorId || typeof password !== "string" || !secret) return NextResponse.json({ error: "Reauthentication failed" }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { password: true } })
  const valid = await bcrypt.compare(password, user?.password || "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid")
  if (!valid) return NextResponse.json({ error: "Reauthentication failed" }, { status: 401 })
  const issuedAt = String(Date.now())
  return NextResponse.json({ reauthToken: `${issuedAt}.${sign(`${actorId}:${issuedAt}`)}` })
}

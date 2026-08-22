import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import bcrypt from "bcryptjs"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const noStoreHeaders = { "Cache-Control": "no-store" }

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401, headers: noStoreHeaders },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400, headers: noStoreHeaders },
    )
  }

  const currentPassword = typeof (body as any)?.currentPassword === "string"
    ? (body as any).currentPassword
    : ""
  const newPassword = typeof (body as any)?.newPassword === "string"
    ? (body as any).newPassword
    : ""

  if (newPassword.length < 12 || newPassword.length > 128) {
    return NextResponse.json(
      { success: false, error: "New password must be between 12 and 128 characters" },
      { status: 400, headers: noStoreHeaders },
    )
  }

  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
  if (!characterClasses.every(pattern => pattern.test(newPassword))) {
    return NextResponse.json(
      { success: false, error: "Use uppercase, lowercase, number, and symbol characters" },
      { status: 400, headers: noStoreHeaders },
    )
  }

  const dbId = session.user.dbId
  const email = session.user.email?.trim().toLowerCase()
  const user = dbId
    ? await prisma.user.findUnique({ where: { id: dbId }, select: { id: true, email: true, name: true, password: true } })
    : email
      ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, password: true } })
      : null

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User account not found" },
      { status: 404, headers: noStoreHeaders },
    )
  }

  const identityParts = [user.email.split("@")[0], ...(user.name || "").split(/\s+/)]
    .map(value => value.trim().toLowerCase())
    .filter(value => value.length >= 3)
  if (identityParts.some(value => newPassword.toLowerCase().includes(value))) {
    return NextResponse.json(
      { success: false, error: "Password must not contain your name or email" },
      { status: 400, headers: noStoreHeaders },
    )
  }

  if (user.password) {
    const validCurrentPassword = currentPassword.length > 0
      && await bcrypt.compare(currentPassword, user.password)
    if (!validCurrentPassword) {
      return NextResponse.json(
        { success: false, error: "Current password is incorrect" },
        { status: 400, headers: noStoreHeaders },
      )
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      return NextResponse.json(
        { success: false, error: "New password must be different from the current password" },
        { status: 400, headers: noStoreHeaders },
      )
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: passwordHash },
  })

  return NextResponse.json(
    { success: true, message: "Password updated" },
    { headers: noStoreHeaders },
  )
}

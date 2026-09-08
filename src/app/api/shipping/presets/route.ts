import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAdminRole } from "@/lib/roles"

async function sessionUser() {
  const session = await getServerSession(authOptions)
  return session?.user || null
}

export async function GET() {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const rows = await prisma.shippingPreset.findMany({ where: { isActive: true, OR: [{ scope: "COMPANY" }, { ownerId: user.dbId || user.id }] }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] })
  return NextResponse.json({ presets: rows })
}

export async function POST(request: Request) {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const body = await request.json()
  const values = [body.length, body.width, body.height, body.weight].map(Number)
  if (!String(body.name || "").trim() || values.some(value => !Number.isFinite(value) || value <= 0)) return NextResponse.json({ error: "A name and positive dimensions/weight are required" }, { status: 400 })
  const scope = body.scope === "COMPANY" && isAdminRole(user.role) ? "COMPANY" : "USER"
  const preset = await prisma.shippingPreset.create({ data: { name: String(body.name).trim(), length: values[0], width: values[1], height: values[2], weight: values[3], scope, ownerId: scope === "USER" ? user.dbId || user.id : null, createdBy: user.dbId || user.id } })
  return NextResponse.json({ success: true, preset }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Preset id required" }, { status: 400 })
  const preset = await prisma.shippingPreset.findUnique({ where: { id } })
  if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 })
  if (preset.scope === "COMPANY" && !isAdminRole(user.role) || preset.scope === "USER" && preset.ownerId !== (user.dbId || user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await prisma.shippingPreset.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
}

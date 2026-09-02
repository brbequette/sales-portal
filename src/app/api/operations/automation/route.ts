import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { generateOperationalTasks } from "@/lib/operational-automation"

export async function GET() { const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse; return NextResponse.json(await generateOperationalTasks({ apply: false })) }
export async function POST() { const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse; return NextResponse.json({ success: true, ...(await generateOperationalTasks({ apply: true })) }) }

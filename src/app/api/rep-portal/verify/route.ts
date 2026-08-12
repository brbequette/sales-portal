import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import crypto from "crypto"

const prisma = new PrismaClient()

// Simple token generation: HMAC of repId with a secret
const SECRET = process.env.PORTAL_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "titan-diamond-portal-secret-2025"

function generateToken(repId: string): string {
  return crypto.createHmac("sha256", SECRET).update(repId).digest("hex").substring(0, 32)
}

function verifyToken(token: string, repId: string): boolean {
  return generateToken(repId) === token
}

/**
 * GET /api/rep-portal/verify?token=<TOKEN>
 * Verifies a magic link token and returns the associated rep info.
 * 
 * GET /api/rep-portal/verify?action=generate&repId=<ID>
 * Generates a magic link token for a rep (admin use).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const action = url.searchParams.get("action")
    const token = url.searchParams.get("token")
    const repId = url.searchParams.get("repId")

    // Generate token for admin
    if (action === "generate" && repId) {
      const user = await prisma.user.findUnique({
        where: { id: repId },
        select: { id: true, name: true, email: true },
      })
      if (!user) {
        return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
      }
      const generatedToken = generateToken(repId)
      const portalUrl = `${url.origin}/rep-portal?token=${generatedToken}`
      return NextResponse.json({
        success: true,
        token: generatedToken,
        portalUrl,
        repName: user.name,
      })
    }

    // Verify token
    if (!token) {
      return NextResponse.json({ success: false, error: "Token required" }, { status: 400 })
    }

    // Find which user this token belongs to by checking all users
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
    })

    const matchedUser = users.find(u => verifyToken(token, u.id))
    if (!matchedUser) {
      return NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      repId: matchedUser.id,
      repName: matchedUser.name,
      email: matchedUser.email,
    })
  } catch (error: any) {
    console.error("Rep portal verify error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

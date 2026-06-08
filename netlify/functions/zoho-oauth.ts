import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"

export const handler: Handler = async (event) => {
  const path = event.path || ""
  const isCallback = path.includes("callback")

  // ── Step 1: Initiate OAuth → redirect user to Zoho login ──
  if (!isCallback) {
    const clientId = process.env.ZOHO_CLIENT_ID
    if (!clientId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ZOHO_CLIENT_ID not configured" }),
      }
    }

    // Netlify provides URL automatically; fallback to SITE_URL or header origin
    const siteUrl =
      process.env.URL ||
      process.env.SITE_URL ||
      `https://${event.headers?.host || "localhost:8888"}`

    const redirectUri = `${siteUrl}/api/auth/zoho/callback`

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "AaaServer.profile.READ",
      access_type: "offline",
      prompt: "consent",
    })

    return {
      statusCode: 302,
      headers: {
        Location: `https://accounts.zoho.${ZOHO_DC}/oauth/v2/auth?${params.toString()}`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  }

  // ── Step 2: Callback — exchange code for token, get user info ──
  const code = event.queryStringParameters?.code
  const error = event.queryStringParameters?.error

  const siteUrl =
    process.env.URL ||
    process.env.SITE_URL ||
    `https://${event.headers?.host || "localhost:8888"}`

  if (error) {
    console.error("Zoho OAuth error:", error)
    return {
      statusCode: 302,
      headers: {
        Location: `${siteUrl}/login?error=${encodeURIComponent(error)}`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  }

  if (!code) {
    return {
      statusCode: 302,
      headers: {
        Location: `${siteUrl}/login?error=no_code`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  }

  try {
    const clientId = process.env.ZOHO_CLIENT_ID!
    const clientSecret = process.env.ZOHO_CLIENT_SECRET!
    const redirectUri = `${siteUrl}/api/auth/zoho/callback`

    // Exchange authorization code for access token
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })

    const tokenRes = await fetch(
      `https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      }
    )

    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", JSON.stringify(tokenData))
      return {
        statusCode: 302,
        headers: {
          Location: `${siteUrl}/login?error=token_failed`,
          "Cache-Control": "no-cache",
        },
        body: "",
      }
    }

    // Get user profile from Zoho
    const userRes = await fetch(
      `https://accounts.zoho.${ZOHO_DC}/oauth/user/info`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    )

    const userData = await userRes.json()
    const email = userData.Email || userData.email
    const fullName =
      userData.Display_Name ||
      userData.display_name ||
      [userData.First_Name, userData.Last_Name].filter(Boolean).join(" ") ||
      email?.split("@")[0]
    const zohoUserId = userData.ZUID || userData.zuid || null

    if (!email) {
      console.error("No email from Zoho user info:", JSON.stringify(userData))
      return {
        statusCode: 302,
        headers: {
          Location: `${siteUrl}/login?error=no_email`,
          "Cache-Control": "no-cache",
        },
        body: "",
      }
    }

    // Find or create user in the database
    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      // Auto-create user for team members
      user = await prisma.user.create({
        data: {
          email,
          name: fullName,
          zohoId: zohoUserId,
          role: "Sales Representative",
        },
      })
      console.log("Created new user via Zoho OAuth:", email)
    } else {
      // Update name/zohoId if missing
      const updates: any = {}
      if (!user.name && fullName) updates.name = fullName
      if (!user.zohoId && zohoUserId) updates.zohoId = zohoUserId
      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        })
      }
    }

    // Build the portal user payload
    const portalUser = {
      id: user.zohoId || user.id,
      name: user.name || fullName,
      email: user.email,
      role: user.role,
      isZohoUser: true,
    }

    // Encode as base64 and redirect to login page which will read it
    const encoded = Buffer.from(JSON.stringify(portalUser)).toString("base64")

    return {
      statusCode: 302,
      headers: {
        Location: `${siteUrl}/login?zoho_auth=${encodeURIComponent(encoded)}`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  } catch (err: any) {
    console.error("Zoho OAuth callback error:", err)
    return {
      statusCode: 302,
      headers: {
        Location: `${siteUrl}/login?error=server_error`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  }
}

import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"

export const handler: Handler = async (event) => {
  const path = event.path || ""
  const originalUri = event.headers?.["x-nf-request-uri"] || event.headers?.["x-forwarded-path"] || ""
  const code = event.queryStringParameters?.code
  const error = event.queryStringParameters?.error

  // Detect callback based on path, headers, or query parameters
  const isCallback = path.includes("callback") || originalUri.includes("callback") || !!code || !!error

  const host = event.headers?.host || ""
  const protocol = event.headers?.["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https")

  // Determine the base site URL for redirect dynamically based on the current host
  // This ensures that custom domains (like salesportal.titandiamond.com) are preserved
  let oauthSiteUrl = `${protocol}://${host}`

  // Allow absolute override via environment variable if defined
  const redirectUri = process.env.ZOHO_REDIRECT_URI || `${oauthSiteUrl}/api/auth/zoho/callback`

  // ── Step 1: Initiate OAuth → redirect user to Zoho login ──
  if (!isCallback) {
    const clientId = process.env.ZOHO_CLIENT_ID
    if (!clientId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ZOHO_CLIENT_ID not configured" }),
      }
    }

    // Determine originating origin to return to after auth completes
    const origin = oauthSiteUrl
    const state = Buffer.from(origin).toString("base64")

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "AaaServer.profile.READ",
      access_type: "offline",
      prompt: "consent",
      state: state,
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
  // Extract target site url from state parameter to support previews/branches
  const stateParam = event.queryStringParameters?.state
  let targetSiteUrl = oauthSiteUrl

  if (stateParam) {
    try {
      const decodedOrigin = Buffer.from(stateParam, "base64").toString("utf-8")
      if (decodedOrigin.startsWith("http://") || decodedOrigin.startsWith("https://")) {
        targetSiteUrl = decodedOrigin
        console.log("Dynamically redirecting to target origin from state:", targetSiteUrl)
      }
    } catch (e) {
      console.error("Failed to decode state parameter:", e)
    }
  }

  if (error) {
    console.error("Zoho OAuth error:", error)
    return {
      statusCode: 302,
      headers: {
        Location: `${targetSiteUrl}/login?error=${encodeURIComponent(error)}`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  }

  if (!code) {
    return {
      statusCode: 302,
      headers: {
        Location: `${targetSiteUrl}/login?error=no_code`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  }

  try {
    const clientId = process.env.ZOHO_CLIENT_ID!
    const clientSecret = process.env.ZOHO_CLIENT_SECRET!

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
          Location: `${targetSiteUrl}/login?error=token_failed`,
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
          Location: `${targetSiteUrl}/login?error=no_email`,
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
        Location: `${targetSiteUrl}/login?zoho_auth=${encodeURIComponent(encoded)}`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  } catch (err: any) {
    console.error("Zoho OAuth callback error:", err)
    return {
      statusCode: 302,
      headers: {
        Location: `${targetSiteUrl}/login?error=server_error`,
        "Cache-Control": "no-cache",
      },
      body: "",
    }
  }
}

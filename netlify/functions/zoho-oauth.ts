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

  const host = event.headers?.["x-forwarded-host"] || event.headers?.host || ""
  const protocol = event.headers?.["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https")
  const clientOrigin = event.queryStringParameters?.origin
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("loca.lt")

  // Determine the base site URL for redirect dynamically.
  let oauthSiteUrl = clientOrigin || `${protocol}://${host}`
  
  // forcefully rewrite it to the known custom domain to ensure Zoho accepts the redirect_uri.
  if (!isLocal && oauthSiteUrl.includes("netlify.app")) {
    oauthSiteUrl = "https://salesportal.titandiamond.com"
  }

  // Ensure redirect_uri matches the domain exactly
  let redirectUri = `${oauthSiteUrl}/api/auth/zoho/callback`

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

    // ── Full scope list for all Zoho APIs used in this application ──────
    // CRM: Accounts, Contacts, Tasks, Custom Modules (invoices), Users
    // Books: Invoices, Estimates, Sales Orders, Contacts, Items, Payments, PDFs
    // Voice: SMS/MMS, Power Dialer campaigns, Call logs
    // Auth: User profile for login
    const REQUIRED_SCOPES = [
      // Authentication / Profile
      "AaaServer.profile.READ",

      // Zoho CRM — Accounts (read + write for upsert/sync)
      "ZohoCRM.modules.accounts.READ",
      "ZohoCRM.modules.accounts.WRITE",

      // Zoho CRM — Contacts (read + write for upsert/sync)
      "ZohoCRM.modules.contacts.READ",
      "ZohoCRM.modules.contacts.WRITE",

      // Zoho CRM — Tasks (read + write for create-task, update-task, get-tasks)
      "ZohoCRM.modules.tasks.READ",
      "ZohoCRM.modules.tasks.WRITE",

      // Zoho CRM — Custom Modules (CustomModule5001 = Invoices in CRM)
      "ZohoCRM.modules.ALL",

      // Zoho CRM — Users (sync active sales reps)
      "ZohoCRM.users.READ",

      // Zoho Books — Invoices
      "ZohoBooks.invoices.READ",
      "ZohoBooks.invoices.CREATE",
      "ZohoBooks.invoices.UPDATE",

      // Zoho Books — Estimates / Quotes
      "ZohoBooks.estimates.READ",
      "ZohoBooks.estimates.CREATE",
      "ZohoBooks.estimates.UPDATE",

      // Zoho Books — Sales Orders
      "ZohoBooks.salesorders.READ",
      "ZohoBooks.salesorders.CREATE",
      "ZohoBooks.salesorders.UPDATE",

      // Zoho Books — Contacts (used when creating transactions)
      "ZohoBooks.contacts.READ",
      "ZohoBooks.contacts.CREATE",

      // Zoho Books — Items / Products catalog
      "ZohoBooks.items.READ",

      // Zoho Books — Payments (apply payments to invoices)
      "ZohoBooks.payments.CREATE",
      "ZohoBooks.payments.READ",

      // Zoho Books — Settings (org-level access for PDFs and emails)
      "ZohoBooks.settings.READ",

      // Zoho Voice — SMS / MMS (send-campaign, zoho-voice)
      "ZohoVoice.sms.CREATE",

      // Zoho Voice — Power Dialer (create/read/update/delete campaigns)
      "ZohoVoice.powerdialer.CREATE",
      "ZohoVoice.powerdialer.READ",
      "ZohoVoice.powerdialer.UPDATE",
      "ZohoVoice.powerdialer.DELETE",

      // Zoho Voice — Call Logs (read call history + recordings)
      "ZohoVoice.call.READ",

      // Zoho Voice — Contacts sync
      "ZohoVoice.contacts.READ",
      "ZohoVoice.contacts.CREATE",
    ].join(",")

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: REQUIRED_SCOPES,
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
        // IMPORTANT: Update the redirectUri for the token exchange to match the exact origin from state
        redirectUri = `${targetSiteUrl}/api/auth/zoho/callback`
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
    // IMPORTANT: Look up by email, NOT by zohoId. The zohoUserId from accounts.zoho.com
    // is the ZUID, which is DIFFERENT from the CRM user ID stored in user.zohoId.
    // We must never overwrite an existing CRM zohoId with the ZUID.
    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      // Auto-create user for team members
      // Note: For new users, we store the ZUID as a temporary zohoId.
      // It will be replaced with the real CRM user ID during the next account sync.
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
      // Update name if missing. NEVER overwrite zohoId if it already exists —
      // the existing zohoId is the CRM user ID which is correct for API calls.
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
    // Use the DB user's zohoId (CRM ID) for API calls, fall back to cuid
    const portalUser = {
      id: user.zohoId || user.id,
      dbId: user.id,  // Always include the Prisma cuid for direct DB lookups
      name: user.name || fullName,
      email: user.email,
      role: user.role,
      isZohoUser: true,
    }

    console.log("OAuth login successful:", { email: user.email, zohoId: user.zohoId, role: user.role })

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

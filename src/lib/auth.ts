import NextAuth, { NextAuthOptions } from "next-auth"
import ZohoProvider from "next-auth/providers/zoho"
import type { Prisma } from "@prisma/client"
import { prisma } from "./prisma"

if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://titan-sales-portal.netlify.app"
}

const REQUIRED_SCOPES = [
  "AaaServer.profile.READ",
  "ZohoCRM.modules.accounts.READ",
  "ZohoCRM.modules.accounts.WRITE",
  "ZohoCRM.modules.contacts.READ",
  "ZohoCRM.modules.contacts.WRITE",
  "ZohoCRM.modules.tasks.READ",
  "ZohoCRM.modules.tasks.WRITE",
  "ZohoCRM.modules.ALL",
  "ZohoCRM.users.READ",
  "ZohoBooks.invoices.READ",
  "ZohoBooks.invoices.CREATE",
  "ZohoBooks.invoices.UPDATE",
  "ZohoBooks.estimates.READ",
  "ZohoBooks.estimates.CREATE",
  "ZohoBooks.estimates.UPDATE",
  "ZohoBooks.salesorders.READ",
  "ZohoBooks.salesorders.CREATE",
  "ZohoBooks.salesorders.UPDATE",
  "ZohoBooks.contacts.READ",
  "ZohoBooks.contacts.CREATE",
  "ZohoBooks.items.READ",
  "ZohoBooks.payments.CREATE",
  "ZohoBooks.payments.READ",
  "ZohoBooks.settings.READ",
  "ZohoVoice.sms.CREATE",
  "ZohoVoice.powerdialer.CREATE",
  "ZohoVoice.powerdialer.READ",
  "ZohoVoice.powerdialer.UPDATE",
  "ZohoVoice.powerdialer.DELETE",
  "ZohoVoice.call.READ",
  "ZohoVoice.call.CREATE",
  "ZohoVoice.contacts.READ",
  "ZohoVoice.contacts.CREATE",
].join(",")

const ZOHO_DC = process.env.ZOHO_DC || "com"

function profileString(profile: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = profile[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export const authOptions: NextAuthOptions = {
  providers: [
    ZohoProvider({
      clientId: process.env.NEXTAUTH_ZOHO_CLIENT_ID || process.env.ZOHO_CLIENT_ID || "",
      clientSecret: process.env.NEXTAUTH_ZOHO_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || "",
      authorization: {
        url: `https://accounts.zoho.${ZOHO_DC}/oauth/v2/auth`,
        params: {
          scope: REQUIRED_SCOPES,
          access_type: "offline",
          prompt: "consent",
        }
      },
      token: `https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`,
      userinfo: `https://accounts.zoho.${ZOHO_DC}/oauth/user/info`,
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "zoho") {
        const email = user.email
        if (!email) return false
        const zohoProfile = (profile || {}) as Record<string, unknown>
        let fullName = user.name ||
          profileString(zohoProfile, "Display_Name", "display_name") ||
          [profileString(zohoProfile, "First_Name"), profileString(zohoProfile, "Last_Name")].filter(Boolean).join(" ") ||
          email.split("@")[0]

        if (fullName === "BEN BEQUETTE") {
          fullName = "Benjamin Bequette";
        }

        const zohoUserId = profileString(zohoProfile, "ZUID", "zuid") || null

        // Sync to database -- check by zohoId first (merges stub users from account sync), then by email
        let dbUser = null

        // 1. Try finding by Zoho User ID (catches stub users created during account sync with dummy emails)
        if (zohoUserId) {
          dbUser = await prisma.user.findUnique({ where: { zohoId: zohoUserId } })
        }

        // 2. Fallback: find by real email
        if (!dbUser) {
          dbUser = await prisma.user.findUnique({ where: { email } })
        }

        if (!dbUser) {
          // Brand new user -- create with real info
          dbUser = await prisma.user.create({
            data: {
              email,
              name: fullName,
              zohoId: zohoUserId,
              role: "Sales Representative",
            },
          })
        } else {
          // Existing user -- merge/update: fix dummy email, missing name, missing zohoId
          const updates: Prisma.UserUpdateInput = {}
          if (dbUser.email.includes("@dummy.titandiamond.com") && email) updates.email = email
          if ((!dbUser.name || dbUser.name === "Unknown Owner") && fullName) updates.name = fullName
          if (!dbUser.zohoId && zohoUserId) updates.zohoId = zohoUserId
          if (Object.keys(updates).length > 0) {
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: updates,
            })
          }
        }
        
        // Inject DB properties into NextAuth user object for the jwt callback
        user.id = dbUser.zohoId || dbUser.id
        user.dbId = dbUser.id
        user.role = dbUser.role
        user.isZohoUser = true
      }
      return true
    },
    async jwt({ token, user, account }) {
      // User is defined on the first sign in
      if (user) {
        token.id = user.id
        token.dbId = user.dbId
        token.role = user.role
        token.isZohoUser = account?.provider === "zoho" || user.isZohoUser
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id || token.sub || ""
        session.user.dbId = token.dbId
        session.user.role = token.role
        session.user.isZohoUser = token.isZohoUser
      }
      return session
    }
  },
  pages: {
    signIn: '/employee-login',
    error: '/employee-login',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
}

export default NextAuth(authOptions)

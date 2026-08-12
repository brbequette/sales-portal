import NextAuth, { NextAuthOptions } from "next-auth"
import ZohoProvider from "next-auth/providers/zoho"
import type { Prisma } from "@prisma/client"
import { prisma } from "./prisma"

if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://titan-sales-portal.netlify.app"
}

const LOGIN_SCOPE = "AaaServer.profile.READ"

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
          scope: LOGIN_SCOPE,
        }
      },
      token: `https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`,
      userinfo: `https://accounts.zoho.${ZOHO_DC}/oauth/user/info`,
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "zoho") {
        const email = user.email?.trim().toLowerCase()
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

        const [zohoUser, emailUser] = await Promise.all([
          zohoUserId ? prisma.user.findUnique({ where: { zohoId: zohoUserId } }) : null,
          prisma.user.findUnique({ where: { email } }),
        ])
        let dbUser = zohoUser || emailUser

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
          const updates: Prisma.UserUpdateInput = {}
          if (dbUser.email.includes("@dummy.titandiamond.com") && !emailUser) updates.email = email
          if ((!dbUser.name || dbUser.name === "Unknown Owner") && fullName) updates.name = fullName
          if (!dbUser.zohoId && zohoUserId && !zohoUser) updates.zohoId = zohoUserId
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
        user.email = email
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
    },
    async redirect({ url, baseUrl }) {
      const destination = new URL(url, baseUrl)
      const dashboardUrl = new URL("/dashboard", baseUrl).toString()

      if (destination.origin !== new URL(baseUrl).origin) {
        return dashboardUrl
      }

      if (destination.pathname === "/employee-login" || destination.pathname === "/admin-login") {
        return dashboardUrl
      }

      return destination.toString()
    }
  },
  pages: {
    signIn: '/employee-login',
    error: '/employee-login',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
}

export default NextAuth(authOptions)

import NextAuth, { NextAuthOptions } from "next-auth"
import ZohoProvider from "next-auth/providers/zoho"
import CredentialsProvider from "next-auth/providers/credentials"
import type { Prisma } from "@prisma/client"
import { prisma } from "./prisma"

// Dynamically handle NEXTAUTH_URL
if (!process.env.NEXTAUTH_URL && typeof window === "undefined") {
  process.env.NEXTAUTH_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || undefined
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
      clientId: process.env.NEXTAUTH_ZOHO_CLIENT_ID || process.env.ZOHO_CLIENT_ID || "dummy_zoho_client_id",
      clientSecret: process.env.NEXTAUTH_ZOHO_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || "dummy_zoho_client_secret",
      authorization: {
        url: `https://accounts.zoho.${ZOHO_DC}/oauth/v2/auth`,
        params: {
          scope: LOGIN_SCOPE,
        }
      },
      token: `https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`,
      userinfo: `https://accounts.zoho.${ZOHO_DC}/oauth/user/info`,
    }),
    CredentialsProvider({
      name: "Staff & Contractor Credentials",
      credentials: {
        email: { label: "Email / Rep ID", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const email = credentials.email.trim().toLowerCase();

        // Search user by email or name
        let dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email: { equals: email, mode: 'insensitive' } },
              { name: { contains: email, mode: 'insensitive' } },
              { zohoId: email }
            ]
          }
        }).catch(() => null);

        // Demo / fallback auto-user creation if dbUser does not exist
        if (!dbUser) {
          const isStaff = email.includes("titan") || email.includes("rep") || email.includes("admin") || email.includes("ben");
          const role = isStaff ? (email.includes("admin") ? "Administrator" : "Sales Representative") : "Customer";
          const name = email.includes("ben") ? "Benjamin Bequette" : email.split("@")[0].toUpperCase();

          dbUser = await prisma.user.create({
            data: {
              email,
              name,
              role,
            }
          }).catch(() => null);
        }

        if (dbUser) {
          return {
            id: dbUser.zohoId || dbUser.id,
            dbId: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            isZohoUser: true,
          };
        }

        return {
          id: email,
          name: email.split("@")[0],
          email,
          role: "Sales Representative",
          isZohoUser: true,
        };
      }
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
        
        user.id = dbUser.zohoId || dbUser.id
        user.dbId = dbUser.id
        user.role = dbUser.role
        user.isZohoUser = true
        user.email = email
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.dbId = (user as any).dbId || user.id
        token.role = (user as any).role || "Sales Representative"
        token.isZohoUser = account?.provider === "zoho" || (user as any).isZohoUser
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
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return `${baseUrl}/dashboard`
    }
  },
  pages: {
    signIn: '/employee-login',
    error: '/employee-login',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "titan-diamond-secret-key-2026",
}

export default NextAuth(authOptions)

import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import ZohoProvider from "next-auth/providers/zoho"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"

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
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "agent@titandiamond.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })

        if (!user || !user.password) {
          return null
        }
        
        const isPasswordValid = await bcrypt.compare(credentials.password, user.password)
        if (!isPasswordValid) return null

        return {
          id: user.zohoId || user.id, // Prefer zohoId for API compatibility if available
          dbId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "zoho") {
        const email = user.email
        if (!email) return false

        const zohoProfile: any = profile
        const fullName = user.name ||
          zohoProfile?.Display_Name ||
          zohoProfile?.display_name ||
          [zohoProfile?.First_Name, zohoProfile?.Last_Name].filter(Boolean).join(" ") ||
          email.split("@")[0]

        const rawZuid = zohoProfile?.ZUID || zohoProfile?.zuid || null
        const zohoUserId = rawZuid ? String(rawZuid) : null

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
          console.log("Created new user via Zoho NextAuth:", email)
        } else {
          // Existing user -- merge/update: fix dummy email, missing name, missing zohoId
          const updates: any = {}
          if (dbUser.email.includes("@dummy.titandiamond.com") && email) updates.email = email
          if ((!dbUser.name || dbUser.name === "Unknown Owner") && fullName) updates.name = fullName
          if (!dbUser.zohoId && zohoUserId) updates.zohoId = zohoUserId
          if (Object.keys(updates).length > 0) {
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: updates,
            })
            console.log("Merged/updated user on Zoho login:", email, updates)
          }
        }
        
        // Inject DB properties into NextAuth user object for the jwt callback
        user.id = dbUser.zohoId || dbUser.id
        ;(user as any).dbId = dbUser.id
        ;(user as any).role = dbUser.role
        ;(user as any).isZohoUser = true
      }
      return true
    },
    async jwt({ token, user, account }) {
      // User is defined on the first sign in
      if (user) {
        token.id = user.id
        token.dbId = (user as any).dbId
        token.role = (user as any).role
        token.isZohoUser = account?.provider === "zoho" || (user as any).isZohoUser
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        ;(session.user as any).id = token.id as string
        ;(session.user as any).dbId = token.dbId as string
        ;(session.user as any).role = token.role as string
        ;(session.user as any).isZohoUser = token.isZohoUser as boolean
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "titan_diamond_sales_portal_production_secret_key_2026",
}

export default NextAuth(authOptions)

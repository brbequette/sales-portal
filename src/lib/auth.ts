import NextAuth, { NextAuthOptions } from "next-auth"
import ZohoProvider from "next-auth/providers/zoho"
import CredentialsProvider from "next-auth/providers/credentials"
import type { Prisma } from "@prisma/client"
import { prisma } from "./prisma"

// Must define process.env.NEXTAUTH_URL before NextAuth initializes providers
const isProd = process.env.NODE_ENV === "production" || process.env.NETLIFY === "true"
const defaultUrl = isProd ? "https://titan-sales-portal.netlify.app" : "http://localhost:3000"

if (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL === "undefined" || process.env.NEXTAUTH_URL.includes("undefined")) {
  process.env.NEXTAUTH_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || defaultUrl
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

async function findUserFlexibly(emailOrInput: string, zohoUserId?: string | null) {
  if (zohoUserId) {
    const userByZohoId = await prisma.user.findFirst({
      where: { zohoId: String(zohoUserId) }
    }).catch(() => null);
    if (userByZohoId) return userByZohoId;
  }

  const cleanInput = (emailOrInput || '').trim().toLowerCase();
  if (!cleanInput) return null;

  // 1. Exact email match
  let user = await prisma.user.findUnique({
    where: { email: cleanInput }
  }).catch(() => null);
  if (user) return user;

  // 2. Insensitive email match
  user = await prisma.user.findFirst({
    where: { email: { equals: cleanInput, mode: 'insensitive' } }
  }).catch(() => null);
  if (user) return user;

  // 3. Match by name or email prefix (e.g. ross, ross.haisler, ross.heisler)
  const prefix = cleanInput.split('@')[0];
  const nameParts = prefix.split(/[._\s-]+/).filter(Boolean);

  const candidateUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: prefix, mode: 'insensitive' } },
        ...nameParts.map(part => ({ name: { contains: part, mode: 'insensitive' as const } })),
        ...nameParts.map(part => ({ email: { contains: part, mode: 'insensitive' as const } })),
      ]
    }
  }).catch(() => []);

  if (candidateUsers.length > 0) {
    const exactNameMatch = candidateUsers.find(u => {
      const uName = ((u.name || '') + ' ' + (u.email || '')).toLowerCase();
      return nameParts.every(p => uName.includes(p));
    });
    if (exactNameMatch) return exactNameMatch;
    return candidateUsers[0];
  }

  return null;
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
      profile(profile: any) {
        const rawEmail = profile.Email || profile.email || profile.Email_Id || profile.email_id || profile.primary_email || profile.User_Email || "";
        const rawName = profile.Display_Name || profile.display_name || profile.name || [profile.First_Name, profile.Last_Name].filter(Boolean).join(" ") || (rawEmail ? rawEmail.split("@")[0] : "");
        const rawId = profile.ZUID || profile.zuid || profile.id || rawEmail;
        return {
          id: String(rawId || "zoho_user"),
          name: String(rawName || "Zoho User"),
          email: String(rawEmail).toLowerCase().trim(),
          image: profile.image_url || profile.picture || null,
        };
      }
    }),
    CredentialsProvider({
      name: "Staff & Contractor Credentials",
      credentials: {
        email: { label: "Email / Rep ID", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const input = credentials.email.trim().toLowerCase();

        const dbUser = await findUserFlexibly(input);
        if (!dbUser || !dbUser.password) return null;

        const bcrypt = require("bcryptjs");
        const isValid = await bcrypt.compare(credentials.password, dbUser.password);
        if (!isValid) return null;

        return {
          id: dbUser.zohoId || dbUser.id,
          dbId: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
          isZohoUser: true,
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "zoho") {
        const zohoProfile = (profile || {}) as Record<string, unknown>
        const rawEmail = user.email || profileString(zohoProfile, "Email", "email", "Email_Id", "email_id", "primary_email") || ""
        const zohoUserId = profileString(zohoProfile, "ZUID", "zuid", "id") || null

        try {
          let dbUser = await findUserFlexibly(rawEmail || "ross", zohoUserId);

          if (!dbUser && rawEmail) {
            dbUser = await prisma.user.create({
              data: {
                email: rawEmail.toLowerCase(),
                name: user.name || "Zoho Staff Member",
                zohoId: zohoUserId,
                role: "Sales Representative",
              },
            }).catch(() => null)
          } else if (dbUser) {
            const updates: Prisma.UserUpdateInput = {}
            if (dbUser.email.includes("@dummy.titandiamond.com") && rawEmail) updates.email = rawEmail.toLowerCase()
            if ((!dbUser.name || dbUser.name === "Unknown Owner") && user.name) updates.name = user.name
            if (!dbUser.zohoId && zohoUserId) updates.zohoId = zohoUserId
            if (Object.keys(updates).length > 0) {
              dbUser = await prisma.user.update({
                where: { id: dbUser.id },
                data: updates,
              }).catch(() => dbUser)
            }
          }
          
          if (dbUser) {
            user.id = dbUser.zohoId || dbUser.id
            user.dbId = dbUser.id
            user.role = dbUser.role
            user.name = dbUser.name
            user.email = dbUser.email
          }
        } catch (e) {
          console.error("Zoho user sync error:", e)
        }

        user.isZohoUser = true
        return true
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
      if (!url || url.includes('/employee-login') || url.includes('/login') || url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}/dashboard`;
      }
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // Fallback
      }
      return `${baseUrl}/dashboard`;
    }
  },
  pages: {
    signIn: '/employee-login',
    error: '/employee-login',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "MISSING-SET-NEXTAUTH_SECRET-IN-ENV",
}

export default NextAuth(authOptions)

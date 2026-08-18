import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    dbId?: string
    role?: string
    isZohoUser?: boolean
  }

  interface Session {
    user: {
      id: string
      dbId?: string
      role?: string
      isZohoUser?: boolean
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    dbId?: string
    role?: string
    isZohoUser?: boolean
  }
}

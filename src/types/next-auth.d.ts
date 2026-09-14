import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    dbId?: string
    role?: string
    isZohoUser?: boolean
    mustRotatePassword?: boolean
  }

  interface Session {
    user: {
      id: string
      dbId?: string
      role?: string
      isZohoUser?: boolean
      mustRotatePassword?: boolean
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    dbId?: string
    role?: string
    isZohoUser?: boolean
    mustRotatePassword?: boolean
  }
}

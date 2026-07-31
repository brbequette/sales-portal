import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { NextResponse } from "next/server";

export async function checkAccountOwnership(
  accountId: string | null | undefined
): Promise<{ 
  authorized: boolean; 
  isAdmin: boolean;
  user?: any;
  errorResponse?: NextResponse 
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      authorized: false,
      isAdmin: false,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const userRoleLower = (session.user as any).role?.toLowerCase() || "";
  const isAdmin = userRoleLower.includes("admin") || userRoleLower.includes("administrator");

  if (isAdmin) {
    return { authorized: true, isAdmin: true, user: session.user };
  }

  if (!accountId) {
    return { authorized: true, isAdmin: false, user: session.user };
  }

  // Fetch the account to check ownerId
  const dbId = (session.user as any).dbId;
  const account = await prisma.account.findFirst({
    where: {
      OR: [
        { id: accountId },
        { zohoId: accountId }
      ]
    },
    select: { ownerId: true }
  });

  if (!account) {
    return {
      authorized: false,
      isAdmin: false,
      errorResponse: NextResponse.json({ error: "Account not found" }, { status: 404 })
    };
  }

  // If the account's ownerId is not the user's dbId, deny access
  if (account.ownerId !== dbId) {
    return {
      authorized: false,
      isAdmin: false,
      errorResponse: NextResponse.json({ error: "Forbidden: You do not own this account." }, { status: 403 })
    };
  }

  return { authorized: true, isAdmin: false, user: session.user };
}

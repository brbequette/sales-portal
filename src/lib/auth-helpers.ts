import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { NextResponse } from "next/server";
import { isAdminRole, isAdministratorRole } from "./roles";

export async function requireAdministrator() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      session: null,
      errorResponse: NextResponse.json({ error: "Authentication required" }, { status: 401 })
    };
  }

  if (!isAdministratorRole(session.user.role)) {
    return {
      session: null,
      errorResponse: NextResponse.json({ error: "Administrator access required" }, { status: 403 })
    };
  }

  return { session, errorResponse: null };
}

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

  const isAdmin = isAdminRole(session.user.role);

  if (isAdmin) {
    return { authorized: true, isAdmin: true, user: session.user };
  }

  if (!accountId) {
    return { authorized: true, isAdmin: false, user: session.user };
  }

  // Fetch the account to check ownerId
  const dbId = session.user.dbId;
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

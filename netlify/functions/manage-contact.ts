import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"

const authenticatedHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  try {
    const sessionUser = await authenticateFunction(event)
    const actorId = sessionUser.dbId || sessionUser.userId
    const canManageAccount = async (targetAccountId: string) => {
      const account = await prisma.account.findUnique({ where: { id: targetAccountId }, select: { ownerId: true } })
      return Boolean(account && (isAdminRole(sessionUser.role) || account.ownerId === actorId))
    }
    const body = JSON.parse(event.body || "{}")
    const { action, contactId, accountId, firstName, lastName, email, phone, mobilePhone, isPrimary, designation } = body

    if (action === "CREATE") {
      if (!accountId) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "accountId is required" }) }
      }
      if (!(await canManageAccount(accountId))) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "You can only manage contacts on your own accounts" }) }
      }
      const newContact = await prisma.contact.create({
        data: {
          accountId,
          zohoId: `local_${Date.now()}`,
          firstName,
          lastName,
          email,
          phone,
          mobilePhone,
          isPrimary: isPrimary || false,
          designation
        }
      })
      
      // If marked as primary, unmark others
      if (isPrimary) {
        await prisma.contact.updateMany({
          where: { accountId, id: { not: newContact.id } },
          data: { isPrimary: false }
        })
      }

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, contact: newContact }) }
    }

    if (action === "UPDATE") {
      if (!contactId) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "contactId is required" }) }
      }
      const existingContact = await prisma.contact.findUnique({ where: { id: contactId }, select: { accountId: true } })
      if (!existingContact) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: "Contact not found" }) }
      }
      if (!(await canManageAccount(existingContact.accountId))) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "You can only manage contacts on your own accounts" }) }
      }
      
      const updatedContact = await prisma.contact.update({
        where: { id: contactId },
        data: {
          firstName,
          lastName,
          email,
          phone,
          mobilePhone,
          isPrimary,
          designation
        }
      })

      // If marked as primary, unmark others
      if (isPrimary) {
        await prisma.contact.updateMany({
          where: { accountId: updatedContact.accountId, id: { not: updatedContact.id } },
          data: { isPrimary: false }
        })
      }

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, contact: updatedContact }) }
    }

    if (action === "DELETE") {
      if (!contactId) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "contactId is required" }) }
      }
      const existingContact = await prisma.contact.findUnique({ where: { id: contactId }, select: { accountId: true } })
      if (!existingContact) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: "Contact not found" }) }
      }
      if (!(await canManageAccount(existingContact.accountId))) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "You can only manage contacts on your own accounts" }) }
      }
      await prisma.contact.delete({ where: { id: contactId } })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Invalid action" }) }
  } catch (error: any) {
    console.error("Error managing contact:", error)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: "Internal Server Error" }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)

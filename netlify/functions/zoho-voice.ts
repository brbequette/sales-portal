import { handler as guardedSmsHandler } from "./send-sms"
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoVoiceAccessToken } from "./lib/zoho-voice-auth"
import { evaluateZohoSmsResponse } from "./lib/zoho-sms-response"

import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { guardSmsSend } from "../../src/lib/sms-suppression"

export const handler: Handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  let authenticatedUser
  try {
    authenticatedUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, corsHeaders)
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, accountId, noteContent, sentiment, reminderDate } = body

    // The author must come from the verified session, never caller input.
    let author = authenticatedUser.dbId
      ? await prisma.user.findUnique({ where: { id: authenticatedUser.dbId } })
      : null
    if (!author && authenticatedUser.email) {
      author = await prisma.user.findUnique({ where: { email: authenticatedUser.email } })
    }
    if (!author) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "No valid user found" })
      }
    }

    // Resolve the account: try zohoId first, then DB id
    const resolveAccount = async (id: string) => {
      let account = await prisma.account.findUnique({ where: { zohoId: id } })
      if (!account) {
        account = await prisma.account.findUnique({ where: { id: id } })
      }
      return account
    }

    if (action === 'LOG_CALL') {
      const account = await resolveAccount(accountId)
      if (!account) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Account not found" })
        }
      }

      const privileged = /admin|manager/i.test(authenticatedUser.role || '')
      if (!privileged && account.ownerId !== author.id) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Forbidden' }) }
      const note = await prisma.note.create({
        data: {
          accountId: account.id,
          authorId: author.id,
          content: noteContent,
          sentiment: sentiment || 'Neutral',
        }
      })

      // Maintain lastCalledAt and set optional reminderDate
      const updateData: any = { lastCalledAt: new Date() }
      if (reminderDate) {
        updateData.nextActionDate = new Date(reminderDate)
      }

      await prisma.account.update({
        where: { id: account.id },
        data: updateData
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, note })
      }
    }

    if (action === 'SEND_SMS') {
      const response = await guardedSmsHandler({ ...event, body: JSON.stringify({ accountId, contactId: body.contactId, message: noteContent, fromNumber: body.fromNumber, requestId: body.requestId }) }, context)
      return response || { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'No SMS acknowledgment received' }) }
    }

    if (action === 'SEND_EMAIL' || action === 'SEND_WHATSAPP') {
      return {
        statusCode: 501,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: `${action === 'SEND_EMAIL' ? 'Email' : 'WhatsApp'} provider sending is not configured` })
      }
    }
    if (action === 'INITIATE_CALL') {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Calls must be initiated by Zoho Voice WebSDK, ZDialer, or the native device dialer' })
      }
    }

    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unknown action' })
    }

  } catch (error: any) {
    console.error('Zoho Voice API Error:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Internal server error" })
    }
  }
}


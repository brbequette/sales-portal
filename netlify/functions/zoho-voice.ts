import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { corsHeaders, handleOptions } from "./lib/cors"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, accountId, noteContent, sentiment, reminderDate, userId, userEmail } = body

    // Resolve author dynamically
    let author = null
    if (userId) {
      author = await prisma.user.findUnique({ where: { id: userId } })
    }
    if (!author && userEmail) {
      author = await prisma.user.findUnique({ where: { email: userEmail } })
    }
    if (!author) {
      author = await prisma.user.findFirst({ where: { email: { contains: "@titandiamond" } } })
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

      const note = await prisma.note.create({
        data: {
          accountId: account.id,
          authorId: author.id,
          content: noteContent,
          sentiment: sentiment || 'Neutral',
          callSid: `ZV-${Date.now()}`
        }
      })

      if (reminderDate) {
        await prisma.account.update({
          where: { id: account.id },
          data: { nextActionDate: new Date(reminderDate) }
        })
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, note })
      }
    }

    if (action === 'SEND_SMS' || action === 'SEND_EMAIL' || action === 'SEND_WHATSAPP') {
      const channelTag: Record<string, string> = {
        SEND_SMS: '[SMS]',
        SEND_EMAIL: '[EMAIL]',
        SEND_WHATSAPP: '[WHATSAPP]',
      }
      const tag = channelTag[action]

      const account = await resolveAccount(accountId)
      if (!account) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Account not found" })
        }
      }

      const note = await prisma.note.create({
        data: {
          accountId: account.id,
          authorId: author.id,
          content: `${tag} ${noteContent || ''}`.trim(),
          sentiment: sentiment || 'Neutral',
        }
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, note })
      }
    }

    if (action === 'INITIATE_CALL') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: 'Call initiated' })
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

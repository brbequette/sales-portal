import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, accountId, noteContent, sentiment, reminderDate } = body

    if (action === 'LOG_CALL') {
      const note = await prisma.note.create({
        data: {
          accountId: accountId,
          authorId: 'dummy-author-id', // In a real app, parse this from the session
          content: noteContent,
          sentiment: sentiment || 'Neutral',
          callSid: `ZV-${Date.now()}` // Mock Call ID
        }
      })

      if (reminderDate) {
        await prisma.account.update({
          where: { zohoId: accountId }, // Using zohoId because frontend passes accountId as zohoId (from URL)
          data: { nextActionDate: new Date(reminderDate) }
        }).catch(async () => {
           // Fallback in case accountId is actually the DB ID
           await prisma.account.update({
              where: { id: accountId },
              data: { nextActionDate: new Date(reminderDate) }
           })
        })
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, note })
      }
    }

    if (action === 'INITIATE_CALL') {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Call initiated' })
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Unknown action' })
    }

  } catch (error: any) {
    console.error('Zoho Voice API Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

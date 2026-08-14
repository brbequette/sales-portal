import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { fetchEmails, fetchEmailContent } from "./lib/zoho-mail"
import OpenAI from "openai"

const ZOHO_ACCOUNT_ID = "6682814000000008002"
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function classifyEmail(subject: string, body: string) {
  try {
    const prompt = `Classify this email. Does it need a response? Return true or false.
Subject: ${subject}
Body: ${body}

Respond with only "true" or "false".`
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
    
    return response.choices[0].message.content?.trim().toLowerCase() === "true"
  } catch (e) {
    console.error("Classification error:", e)
    return false
  }
}

async function generateSuggestedReply(subject: string, body: string) {
  try {
    // Check accepted responses first
    const similar = await prisma.acceptedResponse.findFirst({
      where: { OR: [{ originalSubject: { contains: subject } }] },
      orderBy: { useCount: 'desc' }
    })
    
    if (similar) return similar.responseBody

    const prompt = `Generate a brief, professional reply to this email from a sales representative at Titan Diamond.
Subject: ${subject}
Body: ${body}`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
    
    return response.choices[0].message.content?.trim() || ""
  } catch (e) {
    console.error("Reply generation error:", e)
    return ""
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) }
  }

  try {
    // We would normally dynamically fetch folder ID, but for now we'll fetch the INBOX or default.
    // Fetch folders to get Inbox
    const { fetchFolders } = await import('./lib/zoho-mail')
    const foldersResponse = await fetchFolders(ZOHO_ACCOUNT_ID)
    const inbox = foldersResponse.data?.find((f: any) => f.folderName === 'Inbox')
    
    if (!inbox) throw new Error("Inbox not found")

    const emailsRes = await fetchEmails(ZOHO_ACCOUNT_ID, inbox.folderId, 10, 0)
    const emails = emailsRes.data || []

    let processedCount = 0

    for (const mail of emails) {
      // Check if exists
      const existing = await prisma.email.findUnique({ where: { zohoMailId: mail.messageId } })
      if (existing) continue

      const contentRes = await fetchEmailContent(ZOHO_ACCOUNT_ID, mail.messageId)
      const content = contentRes.data?.content || ""

      const fromAddress = mail.sender || mail.fromAddress
      const toAddress = mail.toAddress || ""
      const subject = mail.subject || ""

      // Match sender to contact or account
      const contact = await prisma.contact.findFirst({ where: { email: fromAddress } })
      let accountId = contact?.accountId
      if (!accountId) {
        // Try user matching for internal tracking?
      }

      const needsResponse = await classifyEmail(subject, content)
      let suggestedReply = ""
      let taskCreated = false

      if (needsResponse) {
        suggestedReply = await generateSuggestedReply(subject, content)
        if (accountId) {
          await prisma.task.create({
            data: {
              zohoId: `email_reply_${mail.messageId}`,
              subject: `Reply to: ${subject}`,
              description: `Suggested Reply: ${suggestedReply}`,
              status: "Not Started",
              accountId: accountId,
              ownerId: contact?.accountId ? (await prisma.account.findUnique({ where: { id: contact.accountId }, select: { ownerId: true } }))?.ownerId || "system" : "system",
              type: "Email"
            }
          })
          taskCreated = true
        }
      }

      await prisma.email.create({
        data: {
          zohoMailId: mail.messageId,
          zohoAccountId: ZOHO_ACCOUNT_ID,
          subject,
          body: content,
          fromAddress,
          toAddress,
          direction: "INBOUND",
          status: "RECEIVED",
          needsResponse,
          suggestedReply,
          taskCreated,
          receivedAt: new Date(parseInt(mail.receivedTime, 10)),
          accountId,
          contactId: contact?.id
        }
      })
      processedCount++
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, processedCount })
    }
  } catch (err: any) {
    console.error("Email sync error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

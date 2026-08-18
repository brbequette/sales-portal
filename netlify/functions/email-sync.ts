import type { Context } from "@netlify/functions"
import { corsHeaders } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { fetchEmails, fetchEmailContent } from "./lib/zoho-mail"
import OpenAI from "openai"

const ZOHO_ACCOUNT_ID = "6682814000000008002"

// Lazy-init so Next.js / build time doesn't crash when API keys are absent locally.
// Netlify AI Gateway automatically injects OPENAI_API_KEY and OPENAI_BASE_URL.
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI()
  return _openai
}

async function classifyEmail(subject: string, body: string) {
  try {
    const prompt = `Classify this email. Does it need a response? Return true or false.
Subject: ${subject}
Body: ${body}

Respond with only "true" or "false".`
    
    const response = await getOpenAI().chat.completions.create({
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

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
    
    return response.choices[0].message.content?.trim() || ""
  } catch (e) {
    console.error("Reply generation error:", e)
    return ""
  }
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  
  if (req.method !== "POST") {
    return Response.json(
      { error: "Method Not Allowed" },
      { status: 405, headers: corsHeaders }
    )
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
      try {
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
      } catch (emailError) {
        console.error(`Failed to process email ${mail.messageId}:`, emailError)
        continue // Skip this email, process the rest
      }
    }

    return Response.json(
      { success: true, processedCount },
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    console.error("Email sync error:", err)
    return Response.json(
      { success: false, error: err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}

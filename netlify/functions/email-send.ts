import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { sendEmail } from "./lib/zoho-mail"

const ZOHO_ACCOUNT_ID = "6682814000000008002"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) }
  }

  try {
    const { toAddress, subject, content, accountId, contactId, fromAddress, originalEmailId, acceptedResponse } = JSON.parse(event.body || "{}")

    if (!toAddress || !subject || !content) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing toAddress, subject, or content" }) }
    }

    const defaultFrom = fromAddress || "ben@titandiamondusa.com"

    // Replace merge tags (basic implementation)
    let processedContent = content
    if (accountId) {
      const account = await prisma.account.findUnique({ where: { id: accountId }, include: { owner: true } })
      if (account) {
        processedContent = processedContent.replace(/{{accountName}}/g, account.name)
        processedContent = processedContent.replace(/{{repName}}/g, account.owner?.name || "")
        processedContent = processedContent.replace(/{{companyName}}/g, "Titan Diamond")
      }
    }

    if (contactId) {
      const contact = await prisma.contact.findUnique({ where: { id: contactId } })
      if (contact) {
        processedContent = processedContent.replace(/{{contactName}}/g, contact.firstName || "")
      }
    }

    const res = await sendEmail(ZOHO_ACCOUNT_ID, {
      fromAddress: defaultFrom,
      toAddress,
      subject,
      content: processedContent
    })

    if (res.status?.code && res.status.code !== 200) {
       throw new Error(res.status.description || "Failed to send email")
    }

    const emailRecord = await prisma.email.create({
      data: {
        zohoMailId: res.data?.messageId || `sent_${Date.now()}`,
        zohoAccountId: ZOHO_ACCOUNT_ID,
        subject,
        body: processedContent,
        fromAddress: defaultFrom,
        toAddress,
        direction: "OUTBOUND",
        status: "REPLIED",
        sentAt: new Date(),
        accountId,
        contactId
      }
    })

    if (acceptedResponse && originalEmailId) {
      const orig = await prisma.email.findUnique({ where: { id: originalEmailId } })
      if (orig) {
        await prisma.acceptedResponse.create({
          data: {
            emailId: originalEmailId,
            originalSubject: orig.subject,
            responseBody: content,
            useCount: 1
          }
        })
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, email: emailRecord })
    }
  } catch (err: any) {
    console.error("Email send error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

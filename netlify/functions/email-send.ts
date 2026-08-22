import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { sendEmail } from "./lib/zoho-mail"

function getZohoAccountId() {
  const id = process.env.ZOHO_MAIL_ACCOUNT_ID;
  if (!id) throw new Error('Missing ZOHO_MAIL_ACCOUNT_ID env var');
  return id;
}

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) }
  }

  try {
    const caller = await authenticateFunction(event)
    const payload = JSON.parse(event.body || "{}")
    const { toAddress, subject, accountId, contactId, originalEmailId, acceptedResponse } = payload
    const content = payload.content ?? payload.body

    if (!toAddress || !subject || !content) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing toAddress, subject, or content" }) }
    }

    const role = String(caller.role || "").toLowerCase()
    const privileged = role.includes("admin") || role.includes("manager")
    const callerId = String(caller.dbId || caller.userId || "")
    let resolvedAccountId = accountId || null
    let account = accountId
      ? await prisma.account.findFirst({ where: { OR: [{ id: accountId }, { zohoId: accountId }] }, include: { owner: true } })
      : null

    if (!account && !privileged) {
      const contact = await prisma.contact.findFirst({
        where: { email: { equals: toAddress, mode: "insensitive" }, account: { ownerId: callerId } },
        include: { account: { include: { owner: true } } },
      })
      account = contact?.account || null
    }
    if (!privileged && (!account || account.ownerId !== callerId)) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, error: "Forbidden" }) }
    }
    if (account) resolvedAccountId = account.id

    const defaultFrom = process.env.COMPANY_FROM_EMAIL || caller.email;
    if (!defaultFrom) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: "Outbound email address is not configured" }) }
    }

    // Replace merge tags (basic implementation)
    let processedContent = content
    if (account) {
        processedContent = processedContent.replace(/{{accountName}}/g, account.name)
        processedContent = processedContent.replace(/{{repName}}/g, account.owner?.name || "")
        processedContent = processedContent.replace(/{{companyName}}/g, process.env.COMPANY_NAME || "")
    }

    if (contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, ...(resolvedAccountId ? { accountId: resolvedAccountId } : {}) },
      })
      if (contact) {
        processedContent = processedContent.replace(/{{contactName}}/g, contact.firstName || "")
      }
    }

    const res = await sendEmail(getZohoAccountId(), {
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
        zohoAccountId: getZohoAccountId(),
        subject,
        body: processedContent,
        fromAddress: defaultFrom,
        toAddress,
        direction: "OUTBOUND",
        status: "REPLIED",
        sentAt: new Date(),
        accountId: resolvedAccountId,
        contactId,
        userId: callerId || null,
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

export const handler = withFunctionAuth(authenticatedHandler)

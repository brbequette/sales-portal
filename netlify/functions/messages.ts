import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const getCampaigns = event.queryStringParameters?.getCampaigns
    const campaignBlastId = event.queryStringParameters?.campaignBlastId
    const checkOnly = event.queryStringParameters?.checkOnly

    // ── checkOnly mode: returns count + latestUpdatedAt only ──────────────
    if (checkOnly === 'true') {
      const [count, latest] = await Promise.all([
        prisma.smsMessage.count({}),
        prisma.smsMessage.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
      ])
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, checkOnly: true, count, latestUpdatedAt: latest?.createdAt ?? null })
      }
    }

    if (getCampaigns === "true") {
      const campaigns = await prisma.campaignBlast.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { name: true } }
        }
      })
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, campaigns })
      }
    }

    if (campaignBlastId) {
      const logs = await prisma.campaignLog.findMany({
        where: { campaignBlastId },
        include: {
          account: {
            include: {
              smsMessages: {
                orderBy: { createdAt: 'desc' }
              }
            }
          }
        }
      })

      const processedAccounts = logs.map((log: any) => {
        const account = log.account
        if (!account) return null
        const msgs = account.smsMessages || []
        
        // Find if there's any inbound message after the log's sentAt time
        const hasReplied = msgs.some((m: any) => m.direction === 'INBOUND' && new Date(m.createdAt) > new Date(log.sentAt))
        const lastMsg = msgs[0] || null

        return {
          id: account.id,
          name: account.name,
          zohoId: account.zohoId,
          campaignStatus: log.status,
          campaignErrorMessage: log.errorMessage,
          hasReplied,
          smsMessages: lastMsg ? [lastMsg] : []
        }
      }).filter(Boolean)

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, accounts: processedAccounts })
      }
    }

    const accountsWithMessages = await prisma.account.findMany({
      where: {
        smsMessages: {
          some: {}
        }
      },
      take: 100,
      include: {
        smsMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            campaignBlast: true
          }
        }
      }
    })

    const sortedAccounts = accountsWithMessages.sort((a: any, b: any) => {
      const aDate = a.smsMessages[0]?.createdAt ? new Date(a.smsMessages[0].createdAt).getTime() : 0
      const bDate = b.smsMessages[0]?.createdAt ? new Date(b.smsMessages[0].createdAt).getTime() : 0
      return bDate - aDate
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, accounts: sortedAccounts })
    }
  } catch (err: any) {
    console.error("Messages Function Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

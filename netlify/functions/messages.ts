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

import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs'

export async function GET(req: Request) {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    // Find all accounts that have SmsMessages
    const accountsWithMessages = await prisma.account.findMany({
      where: {
        smsMessages: {
          some: {}
        }
      },
      include: {
        smsMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    })

    // Sort by most recent message
    const sortedAccounts = accountsWithMessages.sort((a: any, b: any) => {
      const aDate = a.smsMessages[0]?.createdAt?.getTime() || 0
      const bDate = b.smsMessages[0]?.createdAt?.getTime() || 0
      return bDate - aDate
    })

    return NextResponse.json({ success: true, accounts: sortedAccounts })
  } catch (error: any) {
    console.error('Fetch Messages Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

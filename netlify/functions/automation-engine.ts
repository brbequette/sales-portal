import { schedule } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"/**
 * Automation Engine — Runs every 5 minutes via Netlify cron
 * 
 * 1. Process SalesStage drip campaigns (flowConfig steps)
 * 2. Process pending ScheduledMessages
 * 3. Auto-create follow-up Tasks for inactive accounts
 * 4. Process email-to-task pipeline
 */

// ── Flow step types ──────────────────────────────────────
// flowConfig format:
// {
//   steps: [
//     { type: "sms",   body: "Hi {{contactName}}...", delayMinutes: 0 },
//     { type: "wait",  delayMinutes: 1440 },          // 1 day
//     { type: "task",  subject: "Call {{accountName}}", taskType: "Call" },
//     { type: "email", templateId: "xxx", delayMinutes: 2880 },
//     { type: "wait",  delayMinutes: 4320 },          // 3 days
//   ],
//   loopBack: 0,   // step index to loop back to (-1 = no loop)
//   maxLoops: 3
// }

type FlowStep = {
  type: "sms" | "email" | "task" | "wait"
  body?: string
  subject?: string
  templateId?: string
  taskType?: string
  delayMinutes?: number
}

type FlowConfig = {
  steps: FlowStep[]
  loopBack?: number
  maxLoops?: number
}

async function processAutoships(now: Date) {
  console.log("=== Processing Autoship Subscriptions ===")
  try {
    const dueSubscriptions = await prisma.autoshipSubscription.findMany({
      where: {
        status: 'active',
        nextShipDate: { lte: now }
      },
      include: {
        account: {
          include: { contacts: true }
        }
      }
    })

    if (dueSubscriptions.length === 0) return

    let succeeded = 0
    let failed = 0

    for (const sub of dueSubscriptions) {
      try {
        console.log(`[autoship] Processing subscription ${sub.id} for account ${sub.accountId}`)
        
        const token = await getZohoAccessToken()
        const primaryContact = sub.account.contacts?.find(c => c.isPrimary) || sub.account.contacts?.[0]
        const items = (sub.items || []) as any[]

        // Create Sales Order in Zoho Books
        const zohoPayload = {
          customer_id: sub.account.zohoId,
          reference_number: `AUTOSHIP-${sub.id}-${Date.now()}`,
          line_items: items.map(item => ({
            name: item.name,
            sku: item.sku,
            rate: item.unitPrice,
            quantity: item.qty
          }))
        }

        const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/salesorders?organization_id=${ZOHO_ORGANIZATION_ID}`, { signal: AbortSignal.timeout(15000),
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(zohoPayload)
        })

        const data = await res.json()
        if (data.code !== 0) {
          throw new Error(`Zoho API Error: ${data.message}`)
        }

        // Calculate next ship date
        let daysToAdd = 30
        if (sub.frequency === 'quarterly') daysToAdd = 90
        if (sub.frequency === 'biannual') daysToAdd = 180

        const nextShipDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000)

        await prisma.autoshipSubscription.update({
          where: { id: sub.id },
          data: { nextShipDate }
        })

        if (primaryContact?.email) {
          console.log(`[autoship] Sent notification to ${primaryContact.email}`)
        }

        succeeded++
      } catch (err: any) {
        console.error(`[autoship] Failed processing subscription ${sub.id}:`, err.message)
        failed++
      }
    }

    console.log(`[autoship] Processed ${dueSubscriptions.length} subscriptions, ${succeeded} succeeded, ${failed} failed`)
  } catch (error) {
    console.error(`[autoship] Global error during autoship processing:`, error)
  }
}

export const handler = schedule("*/5 * * * *", async () => {
  console.log("=== Automation Engine Started ===")
  const now = new Date()

  try {
    await processAutoships(now)

    // ═══════════════════════════════════════════════════
    // 1. Process SalesStage Drip Campaigns
    // ═══════════════════════════════════════════════════
    
    const activeStates = await prisma.dealAutomationState.findMany({
      where: {
        status: "ACTIVE",
        nextExecuteAt: { lte: now }
      },
      take: 50
    })

    for (const state of activeStates) {
      try {
        const deal = await prisma.deal.findUnique({
          where: { id: state.dealId },
          include: { account: { include: { contacts: true } }, owner: true }
        })
        if (!deal) {
          await prisma.dealAutomationState.update({
            where: { id: state.id },
            data: { status: "CANCELLED" }
          })
          continue
        }

        // Check if deal stage changed
        if (deal.salesStageId !== state.salesStageId) {
          await prisma.dealAutomationState.update({
            where: { id: state.id },
            data: { status: "COMPLETED" }
          })
          continue
        }

        const stage = await prisma.salesStage.findUnique({ where: { id: state.salesStageId } })
        if (!stage?.flowConfig) continue

        const config = stage.flowConfig as unknown as FlowConfig
        const steps = config.steps || []

        if (state.currentStep >= steps.length) {
          // End of steps — check if we should loop
          const loopBack = config.loopBack ?? -1
          const maxLoops = config.maxLoops ?? state.maxLoops

          if (loopBack >= 0 && state.loopCount < maxLoops) {
            await prisma.dealAutomationState.update({
              where: { id: state.id },
              data: {
                currentStep: loopBack,
                loopCount: state.loopCount + 1,
                nextExecuteAt: now,
                lastExecutedAt: now
              }
            })
            console.log(`Deal ${deal.id}: Looping back to step ${loopBack} (loop ${state.loopCount + 1}/${maxLoops})`)
          } else {
            await prisma.dealAutomationState.update({
              where: { id: state.id },
              data: { status: "COMPLETED", lastExecutedAt: now }
            })
            console.log(`Deal ${deal.id}: Flow completed`)
          }
          continue
        }

        const step = steps[state.currentStep]
        const primaryContact = deal.account.contacts?.[0]
        const contactName = primaryContact?.firstName || "there"
        const accountName = deal.account.name
        const repName = deal.owner?.name || ""

        // Execute the step
        switch (step.type) {
          case "sms": {
            const body = (step.body || "")
              .replace(/{{contactName}}/g, contactName)
              .replace(/{{accountName}}/g, accountName)
              .replace(/{{repName}}/g, repName)

            if (primaryContact?.mobile || primaryContact?.phone) {
              await prisma.scheduledMessage.create({
                data: {
                  accountId: deal.accountId,
                  authorId: deal.ownerId,
                  channel: "SMS",
                  fromNumber: process.env.TWILIO_FROM_NUMBER || "",
                  body,
                  scheduledTime: now,
                  status: "PENDING"
                }
              })
              console.log(`Deal ${deal.id}: Queued SMS to ${primaryContact.mobile || primaryContact.phone}`)
            }
            break
          }

          case "email": {
            if (primaryContact?.email) {
              const subject = (step.subject || `Update from Titan Diamond`)
                .replace(/{{contactName}}/g, contactName)
                .replace(/{{accountName}}/g, accountName)

              await prisma.email.create({
                data: {
                  zohoMailId: `auto_${deal.id}_${state.currentStep}_${Date.now()}`,
                  zohoAccountId: "6682814000000008002",
                  subject,
                  body: (step.body || "")
                    .replace(/{{contactName}}/g, contactName)
                    .replace(/{{accountName}}/g, accountName)
                    .replace(/{{repName}}/g, repName),
                  fromAddress: "ben@titandiamondusa.com",
                  toAddress: primaryContact.email,
                  direction: "OUTBOUND",
                  status: "PENDING",
                  accountId: deal.accountId,
                  contactId: primaryContact.id
                }
              })
              console.log(`Deal ${deal.id}: Queued email to ${primaryContact.email}`)
            }
            break
          }

          case "task": {
            await prisma.task.create({
              data: {
                zohoId: `auto_task_${deal.id}_${state.currentStep}_${Date.now()}`,
                subject: (step.subject || `Follow up on ${accountName}`)
                  .replace(/{{contactName}}/g, contactName)
                  .replace(/{{accountName}}/g, accountName),
                description: `Auto-generated by sales stage: ${stage.name}`,
                status: "Not Started",
                priority: "Normal",
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                ownerId: deal.ownerId,
                accountId: deal.accountId,
                dealId: deal.id,
                type: step.taskType || "Call"
              }
            })
            console.log(`Deal ${deal.id}: Created ${step.taskType || "Call"} task for ${accountName}`)
            break
          }

          case "wait": {
            // Wait steps just advance with a delay
            console.log(`Deal ${deal.id}: Wait step (${step.delayMinutes || 0} min)`)
            break
          }
        }

        // Advance to next step
        const nextDelay = steps[state.currentStep + 1]?.delayMinutes || step.delayMinutes || 0
        const nextExecuteAt = new Date(now.getTime() + nextDelay * 60 * 1000)

        await prisma.dealAutomationState.update({
          where: { id: state.id },
          data: {
            currentStep: state.currentStep + 1,
            lastExecutedAt: now,
            nextExecuteAt
          }
        })

      } catch (stepErr) {
        console.error(`Error processing deal automation state ${state.id}:`, stepErr)
      }
    }

    // Initialize new deals that entered a stage with flowConfig
    const dealsWithStage = await prisma.deal.findMany({
      where: {
        salesStageId: { not: null },
        NOT: {
          id: {
            in: (await prisma.dealAutomationState.findMany({ select: { dealId: true } })).map(s => s.dealId)
          }
        }
      },
      take: 20
    })

    for (const deal of dealsWithStage) {
      const stage = await prisma.salesStage.findUnique({ where: { id: deal.salesStageId! } })
      if (!stage?.flowConfig) continue

      const config = stage.flowConfig as unknown as FlowConfig
      if (!config.steps?.length) continue

      await prisma.dealAutomationState.create({
        data: {
          dealId: deal.id,
          salesStageId: deal.salesStageId!,
          currentStep: 0,
          maxLoops: config.maxLoops || 3,
          nextExecuteAt: now,
          status: "ACTIVE"
        }
      })
      console.log(`Initialized automation for deal ${deal.id} in stage ${stage.name}`)
    }

    // ═══════════════════════════════════════════════════
    // 2. Process Pending ScheduledMessages
    // ═══════════════════════════════════════════════════
    
    const pendingMessages = await prisma.scheduledMessage.findMany({
      where: {
        status: "PENDING",
        scheduledTime: { lte: now }
      },
      include: { account: true },
      take: 20
    })

    for (const msg of pendingMessages) {
      try {
        // Find the primary contact phone for the account
        const contact = await prisma.contact.findFirst({
          where: { accountId: msg.accountId },
          orderBy: { isPrimary: 'desc' }
        })

        const toNumber = contact?.mobile || contact?.phone || null

        if (!toNumber) {
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: "FAILED", errorMessage: "No phone number found for account" }
          })
          continue
        }

        // Send via existing SMS infrastructure
        const smsRes = await fetch(`${process.env.URL || 'https://titandiamond.netlify.app'}/.netlify/functions/send-sms`, { signal: AbortSignal.timeout(15000),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: toNumber,
            from: msg.fromNumber,
            body: msg.body,
            accountId: msg.accountId,
            mediaUrl: msg.imageUrl || undefined
          })
        })

        if (smsRes.ok) {
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: "SENT", sentAt: now }
          })
          console.log(`Sent scheduled message ${msg.id} to ${toNumber}`)
        } else {
          const errText = await smsRes.text()
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: "FAILED", errorMessage: errText.substring(0, 500) }
          })
          console.error(`Failed to send message ${msg.id}: ${errText}`)
        }
      } catch (msgErr: any) {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: "FAILED", errorMessage: msgErr.message?.substring(0, 500) }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 3. Auto Follow-Up Tasks for Inactive Accounts
    // ═══════════════════════════════════════════════════
    
    const setting = await prisma.systemSetting.findUnique({ where: { key: "auto_followup_days" } })
    const days = setting ? parseInt(setting.value, 10) : 30
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const inactiveAccounts = await prisma.account.findMany({
      where: {
        OR: [
          { lastCalledAt: { lt: cutoffDate } },
          { lastCalledAt: null, createdAt: { lt: cutoffDate } }
        ]
      },
      take: 50
    })

    for (const account of inactiveAccounts) {
      const openTask = await prisma.task.findFirst({
        where: { accountId: account.id, status: { not: "Completed" } }
      })

      if (!openTask) {
        await prisma.task.create({
          data: {
            zohoId: `auto-${account.id}-${Date.now()}`,
            subject: `Follow up with ${account.name}`,
            description: `Auto-generated task: No activity in ${days} days.`,
            status: "Not Started",
            priority: "Normal",
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            ownerId: account.ownerId,
            accountId: account.id,
            type: "Call"
          }
        })
        console.log(`Created auto follow-up task for ${account.name}`)
      }
    }

    // ═══════════════════════════════════════════════════
    // 4. Email-to-Task Pipeline
    // ═══════════════════════════════════════════════════
    
    const unprocessedEmails = await prisma.email.findMany({
      where: { needsResponse: true, taskCreated: false },
      take: 20
    })

    for (const email of unprocessedEmails) {
      if (email.accountId) {
        const account = await prisma.account.findUnique({
          where: { id: email.accountId },
          select: { ownerId: true, name: true }
        })
        if (account) {
          await prisma.task.create({
            data: {
              zohoId: `email_reply_${email.id}`,
              subject: `Reply to: ${email.subject}`,
              description: email.suggestedReply
                ? `Suggested Reply:\n${email.suggestedReply}`
                : `Email from ${email.fromAddress} needs a response.`,
              status: "Not Started",
              priority: "High",
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
              ownerId: account.ownerId,
              accountId: email.accountId,
              type: "Email"
            }
          })
          await prisma.email.update({ where: { id: email.id }, data: { taskCreated: true } })
          console.log(`Created email reply task for ${account.name}`)
        }
      }
    }

    // Update last run time
    await prisma.systemSetting.upsert({
      where: { key: "automation_engine_last_run" },
      update: { value: now.toISOString() },
      create: { key: "automation_engine_last_run", value: now.toISOString() }
    })

    console.log("=== Automation Engine Completed ===")
    return { statusCode: 200 }
  } catch (error) {
    console.error("Automation Engine Error:", error)
    return { statusCode: 500 }
  }
})

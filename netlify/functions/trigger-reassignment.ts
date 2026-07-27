import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { rebalanceAll } = body

    // 1. Fetch settings from DB
    const settings = await prisma.systemSetting.findMany()
    const settingsMap = new Map(settings.map(s => [s.key, s.value]))

    const timeframeMonths = parseInt(settingsMap.get("update_timeframe_months") || "12")
    const rep1 = settingsMap.get("update_group_1_rep_id") || ""
    const rep2 = settingsMap.get("update_group_2_rep_id") || ""
    const rep3 = settingsMap.get("update_group_3_rep_id") || ""
    const rep4 = settingsMap.get("update_group_4_rep_id") || ""

    const assignedReps = [rep1, rep2, rep3, rep4].filter(Boolean)

    if (assignedReps.length === 0) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, message: "No representatives assigned to update groups." })
      }
    }

    // 2. Compute threshold date for inactivity
    const thresholdDate = new Date()
    thresholdDate.setMonth(thresholdDate.getMonth() - timeframeMonths)

    // 3. Mark accounts as "Update Status" if they are inactive
    const markedResult = await prisma.account.updateMany({
      where: {
        lastPurchaseAt: { lt: thresholdDate },
        status: { not: "Update Status" }
      },
      data: { status: "Update Status" }
    })

    // 4. Fetch all update status accounts
    const updateAccounts = await prisma.account.findMany({
      where: { status: "Update Status" },
      select: { id: true, zohoId: true, name: true, ownerId: true }
    })
    
    const allUsers = await prisma.user.findMany({ select: { id: true, zohoId: true } })
    const userToZohoMap = Object.fromEntries(allUsers.map(u => [u.id, u.zohoId]))

    // Initialize counts
    const repCounts: Record<string, number> = {}
    assignedReps.forEach(r => {
      repCounts[r] = 0
    })

    let accountsToAssign: any[] = []
    
    // Protect Montgomery Morgan's accounts from being reassigned
    const MONTGOMERY_ID = "cmppb3de4000013bxtcprpvww"

    if (rebalanceAll) {
      // Reassign everything from scratch, except Montgomery Morgan's accounts
      accountsToAssign = updateAccounts.filter(a => a.ownerId !== MONTGOMERY_ID)
    } else {
      // Incremental: Count how many "Update Status" accounts each group rep currently owns
      const currentCounts = await prisma.account.groupBy({
        by: ['ownerId'],
        where: {
          status: 'Update Status',
          ownerId: { in: assignedReps }
        },
        _count: { id: true }
      })

      currentCounts.forEach(c => {
        repCounts[c.ownerId] = c._count.id
      })

      // Accounts that need assignment: owner is not in the assigned group reps list, and exclude Montgomery's existing accounts
      accountsToAssign = updateAccounts.filter(a => !assignedReps.includes(a.ownerId) && a.ownerId !== MONTGOMERY_ID)
    }

    // 5. Load balance
    const updatePromises: any[] = []
    const reassignedDetails: any[] = []
    const zohoUpdates: any[] = []

    for (const account of accountsToAssign) {
      // Find rep with the lowest count
      let selectedRep = assignedReps[0]
      let minCount = repCounts[selectedRep]

      for (const r of assignedReps) {
        if (repCounts[r] < minCount) {
          selectedRep = r
          minCount = repCounts[r]
        }
      }

      // Assign to this rep
      repCounts[selectedRep]++
      reassignedDetails.push({
        accountId: account.id,
        name: account.name,
        fromOwnerId: account.ownerId,
        toOwnerId: selectedRep
      })

      if (account.zohoId && userToZohoMap[selectedRep]) {
        zohoUpdates.push({
          id: account.zohoId,
          Owner: userToZohoMap[selectedRep]
        })
      }

      updatePromises.push(
        prisma.account.update({
          where: { id: account.id },
          data: { ownerId: selectedRep }
        })
      )
    }

    let token = ""
    if (zohoUpdates.length > 0) {
      try {
        token = await getZohoAccessToken() as string
      } catch (err) {
        console.error("Failed to get Zoho token for reassignment", err)
      }
    }

    // Run updates in transaction batches of 100 to maximize database efficiency and minimize connections
    const BATCH_SIZE = 100
    for (let i = 0; i < updatePromises.length; i += BATCH_SIZE) {
      const batch = updatePromises.slice(i, i + BATCH_SIZE)
      await prisma.$transaction(batch)
    }

    // Run Zoho CRM updates in batches of 100 (Zoho API limit for bulk updates)
    if (token) {
      for (let i = 0; i < zohoUpdates.length; i += BATCH_SIZE) {
        const batch = zohoUpdates.slice(i, i + BATCH_SIZE)
        try {
          const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`, {
            method: "PUT",
            headers: {
              "Authorization": `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: batch })
          })
          const crmData = await crmRes.json()
          console.log(`Synced batch of ${batch.length} account owner updates to Zoho`, crmData.data?.[0]?.code)
        } catch (err) {
          console.error("Failed to sync batch to Zoho CRM:", err)
        }
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        markedInactive: markedResult.count,
        totalUpdateAccounts: updateAccounts.length,
        reassignedCount: accountsToAssign.length,
        reassignedDetails: reassignedDetails.slice(0, 10) // Send sample details for confirmation
      })
    }

  } catch (error: any) {
    console.error("Trigger Reassignment Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

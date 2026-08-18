const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function run() {
  for (const t of ['Notification','PushSubscription','TimeEntry','TimeChangeRequest','Advance','Reimbursement','Payout','MonthlyVigGoal','Note','SmsMessage','CallLog','CampaignBlast','CampaignJob','ScheduledMessage']) {
    try {
      const cols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name=${t} ORDER BY ordinal_position`
      console.log(`${t}: ${cols.map(c=>c.column_name).join(', ')}`)
    } catch(e) { console.log(`${t}: TABLE NOT FOUND`) }
  }
  await p.$disconnect()
}
run()

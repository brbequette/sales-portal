const https = require('https')

async function executeSql(sqlString) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sql: sqlString })
    const options = {
      hostname: 'titan-sales-portal.netlify.app',
      port: 443,
      path: '/api/run-sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }

    const req = https.request(options, res => {
      let responseData = ''
      res.on('data', chunk => {
        responseData += chunk
      })
      res.on('end', () => {
        resolve(responseData)
      })
    })

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function main() {
  console.log("Starting SQL execution via API...")
  
  const commands = [
    `CREATE TABLE IF NOT EXISTS "PushSubscription" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "endpoint" TEXT NOT NULL,
        "p256dh" TEXT NOT NULL,
        "auth" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
    );`,

    `CREATE TABLE IF NOT EXISTS "Notification" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "url" TEXT,
        "read" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
    );`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");`,
    `CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");`,
    `CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");`,
    `CREATE INDEX IF NOT EXISTS "Notification_read_idx" ON "Notification"("read");`,

    `ALTER TABLE "PushSubscription" DROP CONSTRAINT IF EXISTS "PushSubscription_userId_fkey";`,
    `ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_fkey";`,

    `ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
  ]
  
  for (const cmd of commands) {
    console.log("Executing:", cmd.substring(0, 50) + "...")
    const res = await executeSql(cmd)
    console.log("Response:", res)
  }
}

main().catch(console.error)

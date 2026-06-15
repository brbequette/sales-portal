const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  const setting = await p.systemSetting.findUnique({ where: { key: 'holidays' } })
  console.log('Raw holidays value:', setting?.value)
  console.log()
  if (setting?.value) {
    const parsed = JSON.parse(setting.value)
    console.log('Parsed type:', typeof parsed)
    console.log('Is array:', Array.isArray(parsed))
    console.log('Length:', parsed.length)
    console.log('First 3 items:', JSON.stringify(parsed.slice(0, 3), null, 2))
    console.log()
    // Check if items have name field
    if (parsed.length > 0) {
      console.log('First item keys:', Object.keys(parsed[0]))
      console.log('First item:', parsed[0])
    }
  }
  process.exit(0)
}
run()

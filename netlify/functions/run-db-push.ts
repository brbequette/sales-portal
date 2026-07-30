import { Handler } from "@netlify/functions"

import { execSync } from 'child_process'

export const handler: Handler = async () => {
  try {
    const output = execSync('npx prisma db push --accept-data-loss', { encoding: 'utf8' })
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, output })
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message, stderr: error.stderr })
    }
  }
}


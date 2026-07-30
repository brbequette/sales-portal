import { Handler } from "@netlify/functions"

import { execSync } from 'child_process'

export const handler: Handler = async () => {
  try {
    const output = execSync('node ./node_modules/prisma/build/index.js db push --accept-data-loss', {
      env: {
        ...process.env,
        HOME: '/tmp',
        PRISMA_CACHE_DIR: '/tmp'
      },
      encoding: 'utf8'
    })
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


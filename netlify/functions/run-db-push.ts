import { Handler } from "@netlify/functions"

import { execSync } from "child_process"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  try {
    const output = execSync("npx prisma db push --accept-data-loss", { encoding: "utf8" })
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, output })
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message, stdout: error.stdout?.toString(), stderr: error.stderr?.toString() })
    }
  }
}

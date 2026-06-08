import { Handler } from "@netlify/functions"
import { execSync } from "child_process"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  try {
    console.log("Running prisma db push inside Netlify function...")
    // Run schema push directly in the runtime container
    const output = execSync("npx prisma db push --accept-data-loss", { encoding: "utf8" })
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, output })
    }
  } catch (err: any) {
    console.error("Serverless db push error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message, stderr: err.stderr })
    }
  }
}

import { Handler } from "@netlify/functions"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  return {
    statusCode: 403,
    headers: cors,
    body: JSON.stringify({ success: false, message: "This endpoint is disabled." })
  }
}

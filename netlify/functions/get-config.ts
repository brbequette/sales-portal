import { Handler } from "@netlify/functions"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({
      authorizeNet: {
        apiLoginId: process.env.AUTHORIZENET_API_LOGIN_ID || "",
        publicClientKey: process.env.AUTHORIZENET_PUBLIC_CLIENT_KEY || "",
        environment: process.env.AUTHORIZENET_ENV || "production",
      }
    })
  }
}

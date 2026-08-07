import { Handler } from "@netlify/functions"


export const handler: Handler = async () => {
  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Disabled for security" })
  }
}


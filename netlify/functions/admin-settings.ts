import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    if (event.httpMethod === "GET") {
      let setting = await prisma.systemSetting.findFirst()
      if (!setting) {
        setting = await prisma.systemSetting.create({
          data: {
            dailyCapUsd: 500,
            warningThreshold: 0.8,
            notificationEmail: "alerts@titandiamond.com"
          }
        })
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, settings: setting }) }
    }

    if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      let setting = await prisma.systemSetting.findFirst()
      if (!setting) {
        setting = await prisma.systemSetting.create({ data: body })
      } else {
        setting = await prisma.systemSetting.update({
          where: { id: setting.id },
          data: body
        })
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, settings: setting }) }
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) }
  } catch (err: any) {
    console.error("Admin Settings Function Error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

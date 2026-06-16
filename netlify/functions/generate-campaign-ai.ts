import { Handler } from "@netlify/functions"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key",
})

export const handler: Handler = async (event, context) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { prompt, type, channel } = body

    if (!prompt) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, message: "Prompt is required" }) }
    }

    if (type === "image") {
      // Generate Image using DALL-E 3
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
      })

      const imageUrl = response.data[0].url

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, result: imageUrl })
      }
    } else {
      // Generate Text using GPT-4o
      const systemPrompt = `You are an elite B2B sales copywriter for Titan Diamond, a company selling premium diamond blades and tools to contractors. 
Your task is to write a highly persuasive, natural-sounding campaign message for a ${channel || "SMS"} campaign.
Keep it concise, engaging, and professional. 
DO NOT use placeholders like [Name] or [Company]. Just write the message so it can be sent as a blast to many contractors.
Use industry lingo occasionally if appropriate (e.g., "like a hot knife through butter", "let the blade do the work").`

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 250,
      })

      const generatedText = response.choices[0]?.message?.content?.trim() || ""

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, result: generatedText })
      }
    }
  } catch (err: any) {
    console.error("AI campaign generation error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, message: err.message || "Failed to generate AI content" })
    }
  }
}

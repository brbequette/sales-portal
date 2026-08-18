import type { Context } from "@netlify/functions"
import OpenAI from "openai"
import { authenticateRequest } from "./lib/auth-middleware"

// Lazy-init so `next build` doesn't crash when OPENAI_API_KEY is absent locally.
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI()
  return _openai
}

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: cors })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, message: "Method Not Allowed" }),
      { status: 405, headers: cors }
    )
  }

  try {
    await authenticateRequest(req)
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { prompt, type, channel } = body

    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, message: "Prompt is required" }),
        { status: 400, headers: cors }
      )
    }

    if (type === "image") {
      // Generate Image using the AI Gateway supported image model
      const response = await getOpenAI().images.generate({
        model: "gpt-image-1",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
      })

      const b64 = response.data?.[0]?.b64_json
      const imageUrl = b64 ? `data:image/png;base64,${b64}` : null

      return new Response(
        JSON.stringify({ success: true, result: imageUrl }),
        { status: 200, headers: cors }
      )
    } else {
      // Generate Text using GPT-4o
      const systemPrompt = `You are an elite B2B sales copywriter for Titan Diamond, a company selling premium diamond blades and tools to contractors.
Your task is to write a highly persuasive, natural-sounding campaign message for a ${channel || "SMS"} campaign.
Keep it concise, engaging, and professional.
DO NOT use placeholders like [Name] or [Company]. Just write the message so it can be sent as a blast to many contractors.
Use industry lingo occasionally if appropriate (e.g., "like a hot knife through butter", "let the blade do the work").`

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 250,
      })

      const generatedText = response.choices[0]?.message?.content?.trim() || ""

      return new Response(
        JSON.stringify({ success: true, result: generatedText }),
        { status: 200, headers: cors }
      )
    }
  } catch (err: any) {
    console.error("AI campaign generation error:", err)
    return new Response(
      JSON.stringify({ success: false, message: err.message || "Failed to generate AI content" }),
      { status: 500, headers: cors }
    )
  }
}

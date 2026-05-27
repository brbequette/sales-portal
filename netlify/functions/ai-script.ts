import { Handler } from "@netlify/functions"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key",
})

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { accountName, industry, status, lastPurchase, callType, daysSinceLastPurchase, totalRevenue, invoices } = body

    const systemPrompt = `You are a top-tier B2B sales assistant for Titan Diamond. 
Your goal is to write a short, highly persuasive, and conversational sales script for a sales rep to read when calling a client.
The script should be tailored to the specific Call Type requested.
The script should be no longer than 3-4 sentences. Do not include placeholder brackets except for [Rep Name].`

    let contextPrompt = `Client Name: ${accountName}\nIndustry: ${industry}\nAccount Status: ${status}\nLast Purchase Date: ${lastPurchase}\nDays Since Last Purchase: ${daysSinceLastPurchase || 'Unknown'}\nLifetime Value: $${totalRevenue || 'Unknown'}\nCall Type: ${callType || 'Standard'}\n`
    
    if (invoices && invoices.length > 0) {
      contextPrompt += `\nRecent Order History:\n`
      invoices.forEach((inv: any, i: number) => {
        contextPrompt += `- Order ${i+1}: $${inv.amount} on ${new Date(inv.issueDate).toLocaleDateString()}. Items: ${inv.items ? JSON.stringify(inv.items) : 'General Assortment'}\n`
      })
    }
    contextPrompt += `\n`
    
    if (callType === 'Cold Call') {
      contextPrompt += `Context: This is an outreach call. Introduce Titan Diamond, highlight value quickly, and ask for a short intro meeting.\n`
    } else if (callType === 'Objection Handling') {
      contextPrompt += `Context: The client previously objected due to budget constraints. Provide a script that reframes the cost as an investment with our new flexible payment terms.\n`
    } else if (callType === 'Overdue Invoice') {
      contextPrompt += `Context: The client has an overdue invoice. Be polite but firm, asking for a status update on the payment while maintaining the relationship.\n`
    } else if (typeof daysSinceLastPurchase === 'number' && daysSinceLastPurchase > 365) {
      contextPrompt += `Context: This client has not purchased anything in over a year. We need to re-engage them, ask about their current inventory needs, mention a returning-client discount, and reference their past orders to show we know them.\n`
    } else {
      contextPrompt += `Context: This is an active client. Pitch them an upgrade or ask if they need a restock based on their recent order history. Reference their recent items.\n`
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextPrompt }
      ],
      temperature: 0.7,
      max_tokens: 150,
    })

    const script = response.choices[0].message?.content || "Could not generate script."

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, script })
    }

  } catch (error: any) {
    console.error('OpenAI API Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

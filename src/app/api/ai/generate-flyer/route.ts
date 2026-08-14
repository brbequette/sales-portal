import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

// Lazy singleton for OpenAI client
let openai: OpenAI | null = null;
function getOpenAIClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      description,
      targetValue,
      bonusAmount,
      cadence,
      scope,
      repName,
      metric,
      mode
    } = body;

    const client = getOpenAIClient();

    // 1. Generate text for the flyer (tagline + body copy)
    const textPrompt = `
      You are an elite copywriter for a high-performance sales team.
      Generate a short, punchy, badass promotional tagline and body copy for a sales contest.
      Think Nike/Under Armour meets sales hype. Keep it highly motivational and aggressive.
      
      Contest Details:
      Title: ${title}
      Description: ${description}
      Target Value: ${targetValue}
      Bonus Amount: ${bonusAmount}
      Cadence: ${cadence}
      Scope: ${scope}
      Rep Name (if applicable): ${repName || 'N/A'}
      Metric: ${metric}

      Respond strictly in JSON format:
      {
        "tagline": "string (punchy headline)",
        "bodyCopy": "string (1-2 sentences of motivational text)"
      }
    `;

    const textResponse = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: textPrompt }],
      response_format: { type: "json_object" }
    });

    const textContent = JSON.parse(textResponse.choices[0].message.content || '{}');
    const tagline = textContent.tagline || 'CRUSH YOUR GOALS';
    const bodyCopy = textContent.bodyCopy || 'Exceed targets. Reap the rewards.';

    // 2. Generate the flyer image with DALL-E 3
    let imagePrompt = `
      Create a badass, illustrated or photorealistic promotional sales contest flyer.
      Style: Bold, dark, premium aesthetic with gold, amber, and neon accents. Motivational poster energy - fire, trophies, money, diamonds, spartan warrior or gladiator theme. High-performance, luxury sales vibe.
    `;

    if (mode === 'ai_only') {
      imagePrompt += `\nInclude the following text clearly on the flyer:
      Headline: "${tagline}"
      Body: "${bodyCopy}"
      Details: "Target: ${targetValue} | Bonus: $${bonusAmount}"
      `;
    } else {
      imagePrompt += `\nCRITICAL: DO NOT INCLUDE ANY TEXT, WORDS, OR LETTERS IN THE IMAGE. The artwork must leave space for text to be overlaid later.`;
    }

    const imageResponse = await client.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt.trim(),
      n: 1,
      size: "1024x1792",
      style: "vivid",
      response_format: "url"
    });

    const imageUrl = imageResponse.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ success: false, error: 'DALL-E did not return an image' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      tagline,
      bodyCopy,
      mode
    });

  } catch (error: any) {
    console.error('Error generating flyer:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate flyer' },
      { status: 500 }
    );
  }
}

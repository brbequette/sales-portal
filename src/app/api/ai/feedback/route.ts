import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/ai/feedback
 * Updates the helpful rating on an AiChatLog entry.
 */
export async function POST(req: NextRequest) {
  try {
    const { logId, helpful } = await req.json();

    if (!logId || typeof helpful !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'logId and helpful (boolean) are required' },
        { status: 400 }
      );
    }

    await prisma.aiChatLog.update({
      where: { id: logId },
      data: { helpful },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('AI Feedback Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save feedback' },
      { status: 500 }
    );
  }
}

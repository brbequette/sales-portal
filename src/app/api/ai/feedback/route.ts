import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/ai/feedback
 * Updates the helpful rating on an AiChatLog entry.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const { logId, helpful } = await req.json();

    if (!logId || typeof helpful !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'logId and helpful (boolean) are required' },
        { status: 400 }
      );
    }

    const user = session.user as typeof session.user & { dbId?: string; id?: string }
    const actorId = user.dbId || user.id
    const result = await prisma.aiChatLog.updateMany({
      where: { id: logId, userId: actorId },
      data: { helpful },
    });

    if (result.count === 0) return NextResponse.json({ error: 'Chat log not found' }, { status: 404 })

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('AI Feedback Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save feedback' },
      { status: 500 }
    );
  }
}

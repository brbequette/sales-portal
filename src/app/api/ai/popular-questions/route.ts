import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/ai/popular-questions
 * Returns the most frequently asked AI questions, optionally filtered by role.
 * Used by the AiAssistant to show dynamic quick-prompt suggestions.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const role = url.searchParams.get('role') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);

    // Get recent questions (last 30 days), grouped by similarity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch recent questions with good outcomes
    const recentLogs = await prisma.aiChatLog.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        // Only include questions that got helpful answers or at least weren't rated unhelpful
        helpful: { not: false },
        // Exclude empty or very short questions
        question: { not: '' },
        // Filter by role if specified (agents see agent questions, admins see all)
        ...(role && !role.toLowerCase().includes('admin')
          ? { userRole: { not: { contains: 'ADMIN' } } }
          : {}),
      },
      select: {
        question: true,
        helpful: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500, // Get a decent sample
    });

    if (recentLogs.length === 0) {
      return NextResponse.json({ success: true, questions: [] });
    }

    // Group similar questions (normalize and count)
    const questionCounts = new Map<string, { original: string; count: number; helpfulCount: number }>();

    for (const log of recentLogs) {
      // Normalize: lowercase, trim, remove trailing punctuation
      const normalized = log.question
        .toLowerCase()
        .trim()
        .replace(/[?!.]+$/, '')
        .replace(/\s+/g, ' ');

      // Skip very short or very long questions
      if (normalized.length < 8 || normalized.length > 120) continue;

      const existing = questionCounts.get(normalized);
      if (existing) {
        existing.count++;
        if (log.helpful === true) existing.helpfulCount++;
      } else {
        questionCounts.set(normalized, {
          original: log.question.trim(),
          count: 1,
          helpfulCount: log.helpful === true ? 1 : 0,
        });
      }
    }

    // Sort by count (frequency) then by helpfulness
    const sorted = Array.from(questionCounts.values())
      .filter(q => q.count >= 2) // Only include questions asked more than once
      .sort((a, b) => {
        // Score = count * 2 + helpfulCount * 3
        const scoreA = a.count * 2 + a.helpfulCount * 3;
        const scoreB = b.count * 2 + b.helpfulCount * 3;
        return scoreB - scoreA;
      })
      .slice(0, limit);

    const questions = sorted.map(q => q.original);

    return NextResponse.json({ success: true, questions });
  } catch (error: any) {
    console.error('Popular Questions Error:', error);
    return NextResponse.json({ success: true, questions: [] }); // Graceful fallback
  }
}

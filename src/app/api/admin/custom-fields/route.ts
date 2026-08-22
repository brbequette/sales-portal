import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdministrator } from '@/lib/auth-helpers';
;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { searchParams } = new URL(req.url);
    const entity = searchParams.get('entity');
    const search = searchParams.get('search');

    const where: any = {};

    if (entity && entity !== 'ALL') {
      where.entity = entity.toUpperCase();
    }

    if (search) {
      where.OR = [
        { label: { contains: search, mode: 'insensitive' } },
        { apiName: { contains: search, mode: 'insensitive' } },
        { internalKey: { contains: search, mode: 'insensitive' } },
        { customfieldId: { contains: search, mode: 'insensitive' } }
      ];
    }

    const fields = await prisma.customFieldMapping.findMany({
      where,
      orderBy: [
        { entity: 'asc' },
        { label: 'asc' }
      ]
    });

    return NextResponse.json({ success: true, count: fields.length, fields });
  } catch (error: any) {
    console.error('Error fetching custom fields:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch custom fields' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json();
    const { id, label, internalKey, dataType, isActive, description } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Field ID is required' },
        { status: 400 }
      );
    }

    const updated = await prisma.customFieldMapping.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(internalKey !== undefined && { internalKey }),
        ...(dataType !== undefined && { dataType }),
        ...(isActive !== undefined && { isActive }),
        ...(description !== undefined && { description })
      }
    });

    return NextResponse.json({ success: true, field: updated });
  } catch (error: any) {
    console.error('Error updating custom field:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update custom field' },
      { status: 500 }
    );
  }
}

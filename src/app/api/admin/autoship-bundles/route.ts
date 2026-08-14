import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/roles';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isAdminRole(session.user?.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const bundles = await prisma.autoshipBundle.findMany({
      include: {
        _count: {
          select: { subscriptions: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ success: true, bundles });
  } catch (error: any) {
    console.error('Error in GET /api/admin/autoship-bundles:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isAdminRole(session.user?.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, items, frequency, discountPct } = body;

    const bundle = await prisma.autoshipBundle.create({
      data: {
        name,
        description,
        items,
        frequency,
        discountPct,
        isActive: true
      }
    });

    return NextResponse.json({ success: true, bundle });
  } catch (error: any) {
    console.error('Error in POST /api/admin/autoship-bundles:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isAdminRole(session.user?.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, items, frequency, discountPct, isActive } = body;

    if (!id) {
        return NextResponse.json({ success: false, error: 'Bundle ID is required' }, { status: 400 });
    }

    const bundle = await prisma.autoshipBundle.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(items !== undefined && { items }),
        ...(frequency !== undefined && { frequency }),
        ...(discountPct !== undefined && { discountPct }),
        ...(isActive !== undefined && { isActive }),
      }
    });

    return NextResponse.json({ success: true, bundle });
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/autoship-bundles:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isAdminRole(session.user?.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Bundle ID is required' }, { status: 400 });
    }

    await prisma.autoshipBundle.update({
      where: { id },
      data: { isActive: false }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/autoship-bundles:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

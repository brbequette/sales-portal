import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to validate parameters JSON schema format
function validateJsonSchema(schema: any): boolean {
  if (typeof schema !== 'object' || schema === null) return false;
  if (schema.type !== 'object') return false;
  if (typeof schema.properties !== 'object' || schema.properties === null) return false;
  return true;
}

export async function GET() {
  try {
    const tools = await prisma.aiCustomTool.findMany({
      orderBy: { name: 'asc' }
    });
    return NextResponse.json({ success: true, tools });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, parameters, endpointUrl, method = 'POST', bodyTemplate, isActive = true } = body;

    if (!name || !description || !parameters || !endpointUrl) {
      return NextResponse.json({ success: false, error: 'Missing required fields (name, description, parameters, endpointUrl)' }, { status: 400 });
    }

    // Clean name: alphanumeric and underscores only
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (!validateJsonSchema(parameters)) {
      return NextResponse.json({ success: false, error: 'Parameters must be a valid JSON Schema object with "type": "object" and "properties" defined' }, { status: 400 });
    }

    const tool = await prisma.aiCustomTool.create({
      data: {
        name: cleanName,
        description: description.trim(),
        parameters,
        endpointUrl: endpointUrl.trim(),
        method,
        bodyTemplate: bodyTemplate || null,
        isActive
      }
    });

    return NextResponse.json({ success: true, tool });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'A custom tool with this name already exists' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, parameters, endpointUrl, method, bodyTemplate, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing tool ID' }, { status: 400 });
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (description) updateData.description = description.trim();
    if (parameters) {
      if (!validateJsonSchema(parameters)) {
        return NextResponse.json({ success: false, error: 'Parameters must be a valid JSON Schema object' }, { status: 400 });
      }
      updateData.parameters = parameters;
    }
    if (endpointUrl) updateData.endpointUrl = endpointUrl.trim();
    if (method) updateData.method = method;
    if (bodyTemplate !== undefined) updateData.bodyTemplate = bodyTemplate || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const tool = await prisma.aiCustomTool.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ success: true, tool });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing tool ID' }, { status: 400 });
    }

    await prisma.aiCustomTool.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'Tool deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

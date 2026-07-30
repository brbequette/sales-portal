import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  try {
    const output = execSync('npx prisma db push --accept-data-loss', { encoding: 'utf8' });
    return NextResponse.json({ success: true, output });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stderr: error.stderr });
  }
}

export async function POST() {
  try {
    const output = execSync('npx prisma db push --accept-data-loss', { encoding: 'utf8' });
    return NextResponse.json({ success: true, output });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stderr: error.stderr });
  }
}


import { NextResponse } from 'next/server';
import { requireAdministrator } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { normalizeProductOffer } from '@/lib/product-offers';

const clean = (value: unknown, max = 120) => String(value || '').trim().slice(0, max);
const attributesOf = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function GET(request: Request) {
  const auth = await requireAdministrator();
  if (auth.errorResponse) return auth.errorResponse;
  const q = clean(new URL(request.url).searchParams.get('q')).toUpperCase();
  const products = await prisma.product.findMany({
    where: q ? { OR: [{ sku: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : undefined,
    select: { id: true, sku: true, name: true, category: true, giftItem: true, imageUrl: true, attributes: true },
    orderBy: [{ name: 'asc' }, { sku: 'asc' }],
    take: 100,
  });
  return NextResponse.json({ products: products.map((product) => ({ ...product, offer: normalizeProductOffer(attributesOf(product.attributes).publicOffer), attributes: undefined })) });
}

export async function PUT(request: Request) {
  const auth = await requireAdministrator();
  if (auth.errorResponse) return auth.errorResponse;
  const body = await request.json();
  const productId = clean(body.productId, 80);
  if (!productId) return NextResponse.json({ error: 'Product is required.' }, { status: 400 });
  const current = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, attributes: true } });
  if (!current) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const offer = normalizeProductOffer(body.offer);
  for (const tier of offer.tiers) {
    if (!tier.active || !tier.giftSku) continue;
    const gift = await prisma.product.findFirst({ where: { sku: { equals: tier.giftSku, mode: 'insensitive' } }, select: { sku: true, name: true, imageUrl: true } });
    if (!gift) return NextResponse.json({ error: `Gift SKU ${tier.giftSku} was not found.` }, { status: 400 });
    tier.giftSku = gift.sku;
    tier.giftName = gift.name;
    tier.giftImageUrl = gift.imageUrl || '';
  }
  const attributes = { ...attributesOf(current.attributes), publicOffer: offer };
  await prisma.product.update({ where: { id: current.id }, data: { attributes } });
  return NextResponse.json({ success: true, offer });
}

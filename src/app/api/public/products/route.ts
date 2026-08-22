import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeProductOffer } from '@/lib/product-offers';
import { publicStrings, publicUseCases } from '@/lib/public-product-normalization';

export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string; sku: string; name: string; description: string | null; category: string;
  size: string | null; application: string | null;
  productType: string | null; toolType: string | null; equipment: string | null; materials: unknown;
  attributes: unknown; imageUrl: string | null;
};

function publicDetails(raw: string | null) {
  if (!raw) return { description: '', active: true, image: '' };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      description: typeof parsed.text === 'string' ? parsed.text : typeof parsed.pertinentInfo === 'string' ? parsed.pertinentInfo : '',
      active: parsed.status !== 'inactive',
      image: typeof parsed.image === 'string' && !parsed.image.includes('placeholder') ? parsed.image : '',
    };
  } catch { return { description: raw, active: true, image: '' }; }
}

function matches(text: string, pattern: RegExp) { return pattern.test(text); }
function attributeRecord(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function attributeValue(attributes: Record<string, unknown>, key: string) { return typeof attributes[key] === 'string' ? attributes[key].trim() : ''; }
function normalizeDiameter(value: string) {
  const cleaned = value.trim().replace(/[”″]/g, '"');
  if (!cleaned || /[-/]$/.test(cleaned)) return '';
  const match = cleaned.match(/^(\d+(?:\.\d+|\s+\d+\/\d+|\/\d+)?)/);
  return match ? `${match[1]}"` : '';
}
function derivedDetails(product: ProductRow, description: string) {
  const text = `${product.name} ${product.category} ${description}`.toUpperCase();
  const applications = new Set<string>();
  const materials = new Set<string>();
  const equipment = new Set<string>();

  if (matches(text, /REINFORCED|REBAR/)) { applications.add('Reinforced concrete cutting'); materials.add('Reinforced concrete'); }
  if (matches(text, /GREEN CONCRETE|EARLY[ -]?ENTRY/)) { applications.add('Green concrete cutting'); materials.add('Green concrete'); equipment.add('Early-entry saw'); }
  if (matches(text, /ASPHALT/)) { applications.add('Asphalt cutting'); materials.add('Asphalt'); }
  if (matches(text, /CONCRETE|RIVER ROCK|HARD MATERIAL/)) { applications.add('Concrete cutting'); materials.add('Concrete'); }
  if (matches(text, /MASONRY|BRICK|BLOCK|PAVER/)) { applications.add('Masonry cutting'); materials.add('Brick, block & pavers'); }
  if (matches(text, /PORCELAIN|CERAMIC|TILE/)) { applications.add('Tile cutting'); materials.add('Tile & porcelain'); equipment.add('Tile saw'); }
  if (matches(text, /GRANITE|MARBLE|STONE|QUARTZ/)) { applications.add('Stone cutting'); materials.add('Stone & granite'); }
  if (matches(text, /DUCTILE IRON/)) { applications.add('Ductile iron cutting'); materials.add('Ductile iron'); }
  if (matches(text, /STEEL|FERROUS|METAL|DEMOLITION/)) { applications.add('Metal cutting'); materials.add('Metal & steel'); }
  if (matches(text, /CORE BIT|CORE DRILL|CORING/)) { applications.add('Core drilling'); equipment.add('Core drill'); }
  if (matches(text, /CUP WHEEL|GRIND|SURFACE PREP|COATING REMOV/)) { applications.add('Surface preparation'); equipment.add('Angle grinder'); }
  if (matches(text, /RING SAW/)) equipment.add('Ring saw');
  if (matches(text, /WALK.?BEHIND|FLAT SAW/)) equipment.add('Walk-behind saw');
  if (matches(text, /HIGH.?SPEED|POWER CUTTER|CUT.?OFF/)) equipment.add('High-speed saw');
  if (matches(text, /HAND SAW|HANDHELD/)) equipment.add('Handheld saw');

  const sizes = new Set<string>();
  for (const match of description.matchAll(/(?:^|\s)(\d{1,2}(?:\.\d+)?)\s*(?:["”″]|(?=[xX]\s*\.?\d))/g)) {
    const value = Number(match[1]);
    if (value >= 2 && value <= 72) sizes.add(`${Number.isInteger(value) ? value : value.toFixed(1)}"`);
  }
  const signatureSize = product.name.match(/\b(\d{1,2})\s*$/);
  if (signatureSize && Number(signatureSize[1]) >= 4) sizes.add(`${Number(signatureSize[1])}"`);

  let productType = product.productType || product.toolType || '';
  if (!productType) {
    if (matches(text, /CORE BIT|CORE DRILL|CORING/)) productType = 'Core Bits';
    else if (matches(text, /CUP WHEEL|GRIND|POLISH|SURFACE PREP/)) productType = 'Grinding & Surface Prep';
    else if (matches(text, /BLADE|SEGMENTED|TURBO|CONTINUOUS RIM/)) productType = 'Diamond Blades';
    else if (matches(text, /ADAPTER|ARBOR|BUSHING|FLANGE/)) productType = 'Adapters & Accessories';
    else productType = product.category;
  }
  return { sizes: [...sizes], applications: [...applications], materials: [...materials], equipment: [...equipment], productType };
}

export async function GET() {
  const products = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
    SELECT id, sku, name, description, category, size, application,
      "productType", "toolType", equipment,
      materials, attributes, "imageUrl"
    FROM "Product"
    WHERE "giftItem" = false
    ORDER BY name ASC, sku ASC
  `);

  return NextResponse.json({
    products: products.flatMap((product) => {
      const details = publicDetails(product.description);
      if (!details.active) return [];
      const derived = derivedDetails(product, details.description);
      const attributes = attributeRecord(product.attributes);
      const diameter = normalizeDiameter(attributeValue(attributes, 'Blade Diameter'));
      const suitableMaterials = Array.isArray(attributes['Suitable Materials']) ? attributes['Suitable Materials'].map(String) : [];
      const equipment = attributeValue(attributes, 'Equipment');
      const useCases = publicUseCases([
        ...publicStrings(product.application),
        ...publicStrings(product.materials),
        ...suitableMaterials,
        ...derived.applications,
        ...derived.materials,
        details.description,
      ]);
      return [{
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        description: details.description,
        imageUrl: product.imageUrl || details.image,
        productType: product.productType || derived.productType,
        size: diameter || product.size || derived.sizes.join(' | '),
        application: useCases.join(' | '),
        useCases,
        equipment: product.equipment || equipment || derived.equipment.join(' | '),
        materials: useCases,
        attributes: {
          segmentHeight: attributeValue(attributes, 'Segment Height'),
          slotType: attributeValue(attributes, 'Slot Type'),
          offer: normalizeProductOffer(attributes.publicOffer),
        },
      }];
    }),
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

import { Metadata } from 'next';
import { connection } from 'next/server';

import { PublicStorefront } from '@/components/PublicStorefront';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';


export const metadata: Metadata = {
  title: 'Titan Diamond USA | Professional Diamond Blades & Concrete Cutting Tools',
  description: 'Explore professional diamond blades, core bits, cup wheels and polishing tools. Browse by application, find technical resources and request a Titan Diamond USA quote.',
};

const SIGNATURES = ['THE DRAGON','THE ZEUS','THE MEDUSA','THE BARBARIAN','THE DARK KNIGHT','THE BATTLE AXE','THE HOUND OF HADES','THE HYDRA','THE KING','THE MAXIMUS','THE GLADIATOR','THE DEMO DEMON'] as const;
const SIGNATURE_IMAGES: Record<string,string> = { 'THE DRAGON':'dragon-formatted.png','THE ZEUS':'zeus-formatted.png','THE MEDUSA':'medusa-formatted.png','THE BARBARIAN':'barbarian-formatted.png','THE DARK KNIGHT':'dark knight-formatted.png','THE BATTLE AXE':'battle axe-formatted.png','THE HOUND OF HADES':'hounds of hades-formatted.png','THE HYDRA':'hydra-formatted.png','THE KING':'king-formatted.png','THE MAXIMUS':'maximus-formatted.png','THE GLADIATOR':'gladiator-formatted.png','THE DEMO DEMON':'demo demon-formatted.png' };

type SignatureRow = { sku:string; name:string; description:string|null; size:string|null; application:string|null; equipment:string|null; materials:unknown; imageUrl:string|null };
const split = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : typeof value === 'string' ? value.split(/[,;|]/).map(v => v.trim()).filter(Boolean) : [];
const unique = (items:string[]) => [...new Set(items.filter(Boolean))];
const normalizedSizes = (items:string[]) => unique(items.flatMap(item => { const match=item.replace(/[”″]/g,'"').match(/(?:^|\s)(\d{1,2}(?:\.\d+|\s+\d+\/\d+)?)\s*(?:"|IN|INCH|X|$)/i); return match ? [`${match[1]}"`] : []; }));
const controlledValues = (items:string[], kind:'application'|'material'|'equipment') => { const text=items.join(' ').toLowerCase(); const rules = kind === 'application' ? [['Asphalt cutting',/asphalt/],['Green concrete cutting',/green concrete|early.entry/],['Reinforced concrete cutting',/reinforced|rebar/],['Concrete cutting',/concrete/],['Masonry cutting',/masonry|brick|block|paver/],['Stone cutting',/stone|granite|marble/],['Metal cutting',/metal|steel|iron|demolition/]] as const : kind === 'material' ? [['Asphalt',/asphalt/],['Green concrete',/green concrete/],['Reinforced concrete',/reinforced|rebar/],['Concrete',/concrete/],['Brick, block & pavers',/masonry|brick|block|paver/],['Stone & granite',/stone|granite|marble/],['Metal & steel',/metal|steel|iron/]] as const : [['Walk-behind saw',/walk.?behind|flat saw/],['High-speed saw',/high.?speed|cut.?off|power cutter/],['Handheld saw',/handheld|hand saw/],['Table saw',/table saw/],['Angle grinder',/angle grinder/],['Ring saw',/ring saw/],['Wall saw',/wall saw/]] as const; return rules.filter(([,pattern])=>pattern.test(text)).map(([label])=>label); };
async function featuredSignatures() {
  const rows = await prisma.$queryRaw<SignatureRow[]>(Prisma.sql`SELECT sku,name,description,size,application,equipment,materials,"imageUrl" FROM "Product" WHERE "giftItem" = false AND "showOnWeb" = true ORDER BY name,sku`);
  return SIGNATURES.flatMap((family) => {
    const variants = rows.filter(row => row.name.toUpperCase().startsWith(family) && !/\s-\sWHS$/i.test(row.name));
    if (!variants.length) return [];
    const rawValues = (field: 'size'|'application'|'equipment'|'materials') => unique(variants.flatMap(row => split(row[field])));
    let description = variants.map(row => row.description || '').find(Boolean) || 'Commercial Signature Series diamond blade engineered for professional production cutting.';
    try { const parsed = JSON.parse(description); description = parsed.text || parsed.pertinentInfo || description; } catch { /* plain Zoho description */ }
    return [{ family, image:`/product-images/cutouts-v2/${SIGNATURE_IMAGES[family]}`, description, skus:unique(variants.map(v => v.sku)), sizes:normalizedSizes(rawValues('size')), applications:controlledValues(rawValues('application'),'application'), equipment:controlledValues(rawValues('equipment'),'equipment'), materials:controlledValues(rawValues('materials'),'material'), variants:variants.length }];
  });
}

export default async function LandingPage() {
  await connection();
  const signatureBlades = await featuredSignatures();
  return <PublicStorefront blades={signatureBlades} />;
}

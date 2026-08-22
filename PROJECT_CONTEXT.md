# Titan Diamond — Consolidated Project Context

Last reconciled: **2026-08-22 (America/Phoenix)**

This file is the durable handoff for new Codex tasks. It consolidates the
material status from the tasks titled **Review project**, **Redesign TV
dashboard display**, **Match blade images to SKUs**, and **Sync catalog
attributes and products**. Conversation claims are recorded as history; verify
live state before destructive changes or external writes.

## Current source and environments

- Repository: `C:\Users\titan\Documents\ChatGPT\Titan Diamond`
- **Authoritative production for current work is local Docker/WSL**, not
  Netlify. Production is `http://localhost:3000` and LAN access has used
  `http://192.168.0.108:3000`.
- Development is local Docker on port **3001**. Production must stay available
  while changes are tested on dev. Promote only after approval.
- On 2026-08-21 both `http://localhost:3000/login` and
  `http://localhost:3001/tv` returned HTTP 200.
- Production was most recently rebuilt from the **entire current working tree**
  with `scripts/deploy-selfhost.ps1`; its backup, build, migration, restart,
  Books worker, and health checks passed.
- Safe production command from Windows PowerShell:

  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-selfhost.ps1 -ConfirmProduction DEPLOY -HealthTimeoutSeconds 180`

- Docker runs through Ubuntu 24.04 WSL and is not reliably available as a
  `docker` command in Windows PowerShell. Use repository scripts or `wsl -d
  Ubuntu-24.04 -- bash -lc ...`.
- A production database backup is mandatory before every deployment or risky
  data operation. Backups are retained under `backups/` for 14 days.
- Git state is intentionally mixed: at reconciliation there were **300+ dirty
  entries**. These changes are user/project work;
  do not reset, clean, overwrite, or discard them.
- `main`/`origin/main` currently points to `40a4a37` (formatted product images
  and SKU mappings), while local Docker production contains later uncommitted
  work. Do not assume GitHub represents the full deployed application.
- Netlify configuration remains in the repo but is not the current deployment
  target unless the user explicitly changes that decision. On 2026-08-21 the
  user explicitly removed Netlify from the active reconciliation scope.

## Local environment reconciliation (2026-08-21)

- Local Docker production is the authoritative dataset. Production and dev
  now have the same seven Prisma migrations through
  `20260821120000_product_catalog_attributes`.
- A guarded clone utility exists at
  `scripts/clone-production-to-dev.ps1`. It requires `-ConfirmClone SYNC`,
  backs up both databases, stops only the dev app, replaces the dev database,
  restores production data, restarts dev, and verifies health/counts.
- Production and dev key-table counts matched exactly after the clone:
  Account 7,935; Contact 7,082; Deal 8,043; Invoice 7,857; LineItem 58,552;
  Payment 7,412; Product 4,187; PromotionDraft 1; Quote 7,852; SalesOrder 366;
  Task 24; User 12.
- Host, production container, and development container each contained 2,539
  files under `public/product-images`; aggregate hashes matched. The
  `src/lib/image-map.json` hash also matched in all three locations.
- Private/generated working directories (`All Pics`, `Sopify data`, outputs,
  Codex artifacts, backups, and accidental shell files) are ignored by Git and
  must not be pushed. Application source, migrations, PWA/brand assets, and
  operating scripts remain eligible for intentional source control.

## Product direction and non-negotiable rules

- The app is the operational source for users: normal page reads should use the
  local PostgreSQL database, not live Zoho calls.
- Zoho Books changes should sync into the local database automatically; app
  changes should sync back to Books promptly. Minimize API calls, use targeted
  endpoints, persist every retrieved record and line item locally, and batch
  custom-field updates into one PUT per record.
- When both systems changed the same record, detect the conflict, identify the
  newest version, and require approval before overwriting questionable data.
- The user wants robust automation but infrastructure redesign is deferred.
- Names shown in operational interfaces should be uppercase.
- Benjamin Bequette is both **system administrator and sales representative**;
  avoid duplicate/legacy identity records or abbreviated `Ben Bequette`
  attribution.
- Titan Diamond’s system-wide contact number is **(480) 470-2577**.
- The user stated the business does **not use Twilio**. Legacy Twilio code and
  AGENTS references may still exist; do not expand Twilio use without explicit
  confirmation. Zoho/other communication paths should be verified first.
- Gift items remain in accounting/order history but must not appear as normal
  products in the public shop or customer-facing catalog.
- Production data is sensitive. Never include credentials, tokens, `.env`
  contents, customer data, or database dumps in commits or context files.

## Sales, financial, and commission rules

- Sales/goal totals treat valid invoices and sales orders as booked sales;
  payment status must not be required for goal credit.
- TV dates use invoice `issueDate` and sales-order `orderDate`; record
  `createdAt` is not an acceptable transaction-date fallback.
- Estimates without a genuine estimate transaction date must not be counted in
  TV totals. Never invent a date from creation time.
- Monthly sales sheet: include invoices (including drafts) and valid
  uninvoiced sales orders; **do not include estimates**.
- Avoid double counting converted documents. An estimate converted to a sales
  order or an order converted to an invoice must contribute once in the correct
  current document class.
- Display real document numbers, not Zoho record IDs; color-code document types.
- The primary financial metrics are subtotal, dead cost, and dead profit.
  Commission must come from the applicable compensation plan/ledger and must
  not incorrectly depend on paid status.
- Missing dead cost/profit on a displayed invoice or sales order should be sent
  through the authoritative cost processor and synced, not approximated in UI.
- Commission clawback aging is global across all reps and is based on invoice
  due date, independent of the selected commissions year. The default policy
  flags invoices at 30 days overdue and reaches write-off at 120 days overdue;
  admins can change the write-off threshold and warning window in settings.

## TV salesboard status

- The `/tv` experience was rebuilt for large displays with a dark black,
  orange, white, and complementary-color palette, motion, rankings, goals,
  rep/day performance, company KPIs, and a persistent weekly lower section.
- Weekly rep/day rows are ordered highest to lowest; day leaders receive visual
  recognition. Rep names are left aligned.
- The official Titan helmet/full logo artwork is used; excessive glow was
  reduced for readability.
- The production audit task reported:
  - 472 valid 2026 invoices audited
  - 0 missing costs/profits after repair
  - 0 missing salespeople
  - 0 sync conflicts
  - two valid active sales orders complete
  - deleted Zoho sales order `46529` quarantined as orphaned and removed from
    TV totals
- Cost-repair logic covers invoices and sales orders and resolves stale order
  IDs by authoritative document number. The protected repair route is allowed
  through the global proxy but validates its own TV/admin authorization.
- These were verified in the TV task at commit `9ed8d80`; later local Docker
  deployments include that work. Re-audit live data whenever totals appear
  stale because Zoho documents change frequently.

## Product catalog, attributes, and images

- Product cutouts are now rebuilt from untouched masters with
  `scripts/rebuild_product_cutouts_from_masters.py`; it does not recursively
  process the older cutout directory. Approved outputs live in
  `public/product-images/cutouts-v2/` as transparent 1200×1200 PNGs, with the
  subject occupying roughly 91–94% of the canvas. The 2026-08-22 pass approved
  358 unique masters and quarantined 23 non-uniform sources in `skipped.json`
  rather than publishing damaged edges. The public image map points to v2 only
  when a successful output exists, while skipped products retain their prior
  safe image. All 12 Signature families use the v2 master-derived artwork.

- A product-attribute migration exists at
  `prisma/migrations/20260821120000_product_catalog_attributes/` and was applied
  to local Docker production.
- Admin catalog importer exists at `/admin/catalog-import` with preview/apply
  workflow.
- Import defaults to **fill empty fields only**. Existing non-empty values are
  preserved. Conflicts, inferred classifications, and questionable records are
  shown in a diff/review table.
- **Create missing products** is a separate option and defaults off. Unknown
  SKUs show `Will skip` unless explicitly enabled.
- Shopify/product CSV handling retains size, segment height, dimensions,
  equipment, product/tool type, applications, suitable materials, blade/handle
  material, color, options, tags, SEO, metafields, Google Shopping attributes,
  and generic additional attributes.
- Catalog search indexes attributes. Filters cover product type, tool type,
  equipment, material, application, size, vendor, and manufacturer.
- Catalog pagination supports 25/50/100/200 page sizes, range counts,
  previous/next, numbered pages, automatic reset on filter changes, and proper
  empty/loading states.
- Image matching/history:
  - 4,186 current products were used in the matching audit.
  - 438 product records were matched and updated with formatted images.
  - 693 SKU image-map entries were integrity checked; 381 unique referenced
    assets and zero missing files were reported.
  - Zoho image queue completed 395/395 uploads successfully after rate-limited,
    resumable retries.
  - 32 Titan Blade products received themed artwork.
  - `ductile iron.png` remains intentionally unmatched because no current
    product exists.
  - Match report: `outputs/zoho-image-matches/Zoho Image Match Report.xlsx`.
- Formatted source assets and scripts are retained under `All Pics/`,
  `public/product-images/`, and `scripts/`. Preserve originals and rollback
  manifests.
- The public `/signature-series` page now reads current product rows from the
  local PostgreSQL catalog, groups non-wholesale variants into 12 named Titan
  blade families, and resolves authentic artwork through `src/lib/image-map.json`
  with publish-ready image fallbacks. It exposes customer-safe specifications,
  SKUs, sizes, applications, materials, equipment, and manufacturer data while
  keeping costs and Zoho item IDs private. The page is force-dynamic so completed
  Zoho-to-local syncs appear without a rebuild. Its futuristic motion treatment
  preserves the ember canvas and honors reduced-motion preferences.

## Flyer Studio and AI

- Admin Flyer Studio route: `/admin/flyer-studio`.
- Intended workflow:
  1. Giveaway product URL or pasted/uploaded retailer screenshot.
  2. Search and select an active Titan product (no category requirement).
  3. Use selected product and giveaway imagery/data.
  4. Generate contractor-focused marketing copy in the established gritty,
     premium Titan flyer style.
  5. Generate fresh AI artwork—not a form-box template—for both SMS and email.
  6. Save/assign to SMS, email, or phone campaigns.
  7. Build complete costs: package price minus blade/product cost, gift,
     tariff, VIG, commission, packaging, handling, shipping, payment fees, and
     other overhead; show profit.
  8. Build the Zoho package/bundle and add required promo products.
- Retailer pages often return HTTP 403. Screenshot paste/upload is the approved
  fallback and must actually populate extracted product data.
- AI image generation requires a valid runtime `OPENAI_API_KEY`. A prior
  production key returned HTTP 401; never store or paste keys in source or chat.
  Ollama is useful for local text work but is not a replacement for high-quality
  image generation.

## PWA / Chrome installation

- The local production app is now a Chrome-installable PWA.
- Manifest: `/manifest.json`; service worker: `/sw.js`; branded offline page:
  `/offline.html`.
- New helmet icons: `public/titan-app-icon-{192,512,1024}.png` and
  `public/titan-apple-touch-icon.png`.
- Installed app start URL is `/employee-login`.
- The service worker does **not** cache authenticated pages or API responses;
  it only provides a static offline navigation fallback.
- Chrome install works on `http://localhost:3000` because localhost is treated
  as a secure context. Installing from plain HTTP LAN address
  `http://192.168.0.108:3000` requires HTTPS first.

## Other implemented areas reported across the main task

- PostgreSQL migration baseline was repaired and validated.
- Local production data replaced test data using guarded backup/candidate/
  rollback transfer tooling.
- Secure self-service password changes were added.
- Health watchdog, backups, self-host start/stop scripts, and optional
  Cloudflare Tunnel support exist.
- LAN access was configured through Windows port proxy/firewall.
- Zoho SSO requires a server-based OAuth client with exact redirect URIs; a
  Zoho Self Client cannot serve interactive application login.
- Collections should expose every available company contact phone as clickable
  call actions.
- Fixed overlays/modals must use `createPortal(..., document.body)` to escape
  clipping.

## Public storefront refresh (August 2026)

- Public hero artwork now has a coordinated 15-scene field series under
  `public/images/hero/field-series/`. Every scene uses the homepage hero as its
  lighting/grade reference and the real 14-inch patriotic `THE TITAN` blade as
  its product reference on a realistically proportioned STIHL TS 420-style
  handheld saw. Routes use unique jobsites and actions while retaining dark
  copy space, restrained sparks, authentic PPE, subtle American flags, and the
  existing reduced-motion overlays. The reproducible API workflow is
  `scripts/generate-public-hero-series.ps1`; never store its API key in source.
- Product application and material presentation is consolidated into the
  controlled `publicUseCases` taxonomy in
  `src/lib/public-product-normalization.ts`. Public and internal catalog filters
  expose one `Cuts / Application` selector instead of redundant application and
  material selectors. Public detail cards and Signature cards also show the
  combined field. Raw `Product.application`, `Product.materials`, and imported
  source attributes remain stored unchanged for integrations and auditing.

- The public site now uses a shared dark industrial visual system with restrained
  ember motion, atmospheric grid/aurora layers, and reduced-motion support.
- `/shop` has expanded customer-facing search, sorting, facets, result counts,
  pagination, responsive filters, and a product details modal. Its search/sort
  toolbar sticks flush to the viewport top with no offset gap.
- `/api/public/products` is the dedicated unauthenticated catalog feed. It
  exposes customer-safe product details and omits pricing, costs, inventory,
  and Zoho identifiers. Product imagery resolves through the maintained image
  map, including current Zoho-sourced blade images.
- Many legacy products still have empty structured catalog columns even though
  their Zoho description contains usable specifications. The public products
  API safely normalizes those descriptions into size, application, material,
  equipment, and product-type facets at read time. It must never expose the
  cost, retail, itemId, or other private keys embedded in the raw description.
- Public catalog facets use controlled application/material groups and
  diameter-only normalized sizes; raw Shopify SEO, Google Shopping, pricing,
  arbor, RPM, grit, and segment notes must not become filter options. Approved
  technical values such as segment height and slot type may be exposed only as
  sanitized product details.
- Manufacturer and vendor remain stored for internal purchasing/integration
  use but are omitted from the public products API, filters, and product views.
  Customer-facing blades are branded Titan Diamond USA.
- The two July 2026 Shopify exports use `TDU-`-prefixed SKUs while Zoho/local
  products store the same identifiers without that prefix. The guarded
  `scripts/repair-catalog-from-shopify.ts` utility normalizes only for matching
  and fills empty local fields without renaming SKUs or overwriting populated
  values. On 2026-08-21 its development-only run matched and repaired 318
  products: 288 sizes/applications, 271 equipment values, 278 material sets,
  and 318 attribute maps/product types. The 1,328 unmatched CSV SKUs were not
  created. Production has not received this repair.
- The transparent 2026 brand variants live under
  `public/images/brand/logo-system/`. Use the horizontal logo at large sizes,
  the wordmark in compact headers, and the helmet mark for narrow/mobile uses;
  readability takes priority over fitting the full lockup into small spaces.
- `src/components/PublicSalesSections.tsx` supplies the reusable conversion
  layer on customer-facing selling pages. It routes visitors by concrete,
  asphalt, and core-drilling applications; explains cost-per-cut buying logic;
  and prompts customers for the five inputs needed for a useful tool match.
  Login, legal, quiz, and calculator routes intentionally omit this layer.
- Shared sales artwork combines the official transparent helmet/wordmark with
  real project blade and cutting imagery. The mark itself must remain unchanged;
  realistic or cinematic depictions can be used as supporting atmosphere when
  copy contrast and product accuracy remain intact.
- `PublicHeroAtmosphere` provides route-aware hero imagery across public pages,
  combining real cutting/product assets, the transparent helmet watermark,
  restrained light motion, and strong dark copy gradients. Login and legal
  pages intentionally omit it, and reduced-motion preferences remain honored.
- The homepage includes `SignatureBladeShowcase`, a content-led presentation of
  current Dragon, Medusa, Zeus, and Barbarian catalog families. Each card opens
  a body-portal slideout with size/SKU context, practical ordering guidance,
  a prominent sticky close control, and links to all 12 live Signature families.
- Public header stacking is explicitly above shared page layers so Pro Tools and
  Applications dropdowns do not render behind hero, catalog, or sales content.
- Product purchase incentives use `src/lib/product-offers.ts` and are stored in
  the existing `Product.attributes.publicOffer` JSON field. Every offer has the
  fixed $100/$250/$500/$750/$1,000/$2,500/$5,000/$10,000 tier framework, while
  each product and tier must be explicitly activated and configured before the
  public catalog advertises a discount, package price, or giveaway. Admins edit
  eligibility at `/admin/product-offers`; configured giveaway SKUs are validated
  against real products and their public name/image is snapshotted into the
  offer. Manufacturer/vendor and protected price/cost data remain private.
- The public catalog detail portal now provides all sanitized product fields,
  application/material/equipment context, and the configured volume/gift ladder
  with tier-aware quote links. Unconfigured tiers are presented only as volume
  quote thresholds and never as promised promotions.
- Route hero atmosphere now uses real night-jobsite concrete-cutting photography
  on company/contact-style pages, application-specific tooling imagery elsewhere,
  and a low-opacity animated flag, dust, sparks, light beam, and helmet watermark.
  The flag is environmental rather than promotional, and reduced-motion settings
  disable the movement.
- Public hero scenes are route-specific rather than a repeated universal banner:
  home, catalog, Signature, applications, core drilling, surface prep, blade
  finder, comparator, resources, RPM, unit conversion, knowledge test, about,
  careers, and contact each receive a distinct source image, crop, or treatment.
- `/login` is the canonical authentication entry with Contractor, Employee, and
  Admin modes. Contractor access retains OTP verification, employees can use
  Zoho SSO or staff credentials, and administrators use Zoho SSO plus role
  enforcement. Legacy `/employee-login` and `/admin-login` URLs temporarily
  redirect to the corresponding canonical mode so bookmarks and auth callbacks
  continue to work.
- Public stacking follows a fixed hierarchy: atmospheric artwork, page content,
  sticky catalog controls, public header/dropdowns, floating assistants, then
  body-portaled product and Signature dialogs at z-index 11000.
- Homepage Featured Diamond Tooling uses a varied bento composition with six
  real transparent product cutouts rather than white-background source photos.
  Catalog cards and the product detail portal use `PublicProductImage`, which
  non-destructively removes connected near-white presentation canvas in the
  browser, tightly refits the tool, and preserves the original Zoho/local image.
  Cross-origin images that cannot be sampled safely retain their original
  fallback rather than failing the card.
- The homepage feature is now Signature-only: six live families are shown at a
  time with previous/next controls for the remaining six. Mobile uses a
  touch-scroll, snap-aligned single-card presentation plus compact arrow and
  progress controls. Cards use the real Signature blade assets and current dev
  catalog variants, SKUs, sizes, applications, materials, and saw fit.
- Public-facing size/application/material/equipment output is consolidated by
  `src/lib/public-product-normalization.ts`. Equivalent diameter spellings are
  emitted once in inch format, and free-form equipment/material strings map to
  controlled customer-facing labels while raw source data remains stored.
- The public header must use the higher-specificity
  `.public-site > header.z-sticky` stacking rule; the generic public child rule
  otherwise wins specificity and places dropdowns behind hero content. Desktop
  dropdowns support both hover and click/keyboard state.
- Development port 3001 uses Next webpack dev mode in `compose.dev.yaml` because
  Turbopack recursively scans the 10,000+ mounted product-image files and can
  hang or panic on the Windows/WSL bind mount. Production build settings are
  unchanged.

## Known risks and open verification work

- The working tree is very large and mixed. Before any commit, enumerate and
  stage an intentional scope. Before a whole-tree deployment, state explicitly
  that it will include all current local changes.
- The deployed local tree is ahead of Git. A future task should create a
  reviewed consolidation commit/branch only after separating generated assets,
  temporary artifacts, dumps, and user data from source.
- Untracked root artifacts such as `.codex-tmp/`, `.codex-artifact/`, `outputs/`,
  `All Pics/`, and stray field-name files require classification; do not delete
  them without approval.
- Turbopack builds report broad filesystem tracing warnings around admin image
  routes. Builds pass, but tracing should be narrowed for performance and image
  size.
- Full UI consistency/permissions audit remains an ongoing goal: non-admin
  sales hub and admin pages need responsive visual checks, table search/sort/
  filters, expanded-section validation, and rep-level authorization verification.
- Re-verify Ross Haisler commission results and Benjamin Bequette attribution
  against live compensation plans after any commission-engine change.
- Zoho data changes often. Use incremental Books sync and authoritative cost
  processors before declaring dashboard numbers current.
- Infrastructure planning for a dedicated in-house Windows host and broader
  remote HTTPS access was intentionally deferred.

## Validation and operating habits

- Read the relevant Next.js 16 guide under `node_modules/next/dist/docs/` before
  changing framework APIs or file conventions.
- Prefer `rg`/`rg --files` for discovery.
- Run `npx tsc --noEmit` and `npm run build` for significant releases; run
  focused tests/lint proportional to the change.
- Verify production endpoints and Docker health after deployment; do not infer
  success from a build, Git push, or container start alone.
- Keep dev on port 3001 and production on 3000. Do not mutate production while
  testing unless the user explicitly approves promotion or a specific data
  repair.

## 2026-08-21 production release

- The complete local workspace was deployed through the guarded self-hosted
  production workflow. Backups `tdgpt-20260821-191755.dump` and
  `tdgpt-20260821-193110.dump` were created; all seven repository migrations
  are applied and `http://localhost:3000/login` passed health checks.
- The Netlify managed PostgreSQL database was backed up to
  `backups/netlify-20260821-192752.dump` before schema or catalog changes.
  Its pre-existing schema used legacy migration records (`001_init` and
  `008_sales_lifecycle`), so the verified baseline was recorded and the six
  missing repository migrations were applied with Prisma.
- Shopify catalog enrichment was applied fill-only: 318 matched products in
  Netlify production and 1,523 matched products in self-hosted production.
  Raw manufacturer/vendor values remain stored, but manufacturer is excluded
  from public filters and presentation.
- The homepage now calls Next.js 16 `connection()` before its live Signature
  Series query. This prevents build-time database access while retaining fresh
  runtime product details.
- Netlify project `titan-sales-portal` (`www.tdusales.com`) is connected to
  `brbequette/sales-portal` main, not this workspace's historical `origin`
  (`brbequette/TDGPT`). Production code promotion must target the connected
  repository or use an account authorized for manual production deploys.
- Release commit `de50819b1eb2e807db88f47b14caa7158c018f3e` was pushed as a
  fast-forward to the Netlify-linked `main` branch. Netlify deploy
  `6a890b031e3cdc000868a87e` was immediately skipped with `account credit usage
  exceeded`; the custom domain therefore continues serving prior code deploy
  `6a85eb5d75f02b00080bff6f` until the account's build credits are restored and
  the queued production commit is retried. The managed database changes are
  already live and backward-compatible with that prior code.
- Follow-up production build `6a8955d43974a12121ed53c0` completed on
  2026-08-22 and published deploy `6a8955d43974a12121ed53c2` from commit
  `077217d50bf019bb4c88f9870d0eb903d1ba3b5d`. Live checks returned HTTP 200
  for `/`, `/shop`, `/signature-series`, `/api/public/products`, and `/login`;
  Prisma reports all seven migrations current. `www.tdusales.com` is now on the
  refreshed storefront release.
- Contractor Flyer Studio accepts an image from the system clipboard anywhere
  on the page. A Print Screen followed by Ctrl+V reuses the authenticated
  product-screenshot vision route, sets the screenshot as the giveaway image,
  and fills visible product details for review. Text-only paste continues to
  behave normally.
- After AI artwork is generated, Flyer Studio displays a revision prompt and
  sends the current flyer back as the primary high-fidelity edit source. The
  revision route preserves supplied campaign facts and product references while
  applying the requested visual/layout edits.

## 2026-08-22 Flyer Studio and catalog cutout release

- Reference flyers are style guidance only. They are no longer composited into
  deterministic previews, and the artwork prompt expressly prohibits copying
  their pixels, products, people, logos, wording, offers, or backgrounds.
- Flyer Studio supplies the official light Titan horizontal logo as an exact
  image input. It now has separate pre-render creative-direction and post-render
  revision prompts; neither may override locked products, pricing, offer facts,
  logo, or rep contact data.
- Non-JSON gateway/function responses are decoded into useful flyer-generation
  errors instead of failing with a generic JSON parse exception.
- The 693 SKU image-map entries resolve to 381 unique catalog master images.
  All 381 now have generated 1200px transparent PNG cutouts under
  `public/product-images/cutouts/`; originals and annotated detail diagrams stay
  untouched. Flyer Studio bootstrap prefers the same SKU cutout map.
- The cutout library was verified with zero missing, opaque, or blank master
  images. `scripts/build_product_cutouts.py` is the reproducible batch tool.
- Weekly TV payloads now include each invoice/sales-order account owner ID and
  the TV board attributes documents by that stable rep ID before falling back
  to salesperson-name matching. This addresses rep rows with blank/zero values
  caused by name variants.
- Netlify production deploy `6a896ac9f1b8bb00086636f9` published commit
  `612df2a0db48c364fd8d70e33ef9298fb2ba09e5` at 2026-08-22 09:27 UTC. Live
  checks returned HTTP 200 for `/`, `/shop`, `/tv`, `/api/public/products`, and
  the authenticated Flyer Studio redirect. A live cutout was verified as
  1200x1200 RGBA with real transparent and opaque pixels.

## 2026-08-22 Benjamin Bequette production identity merge

- A fresh Netlify production database recovery snapshot was created and
  verified before the identity repair (`2026-08-22T10:02:17.519Z`).
- The three Benjamin/Ben Bequette user rows were audited through an
  administrator-only maintenance route. The Zoho-linked account
  `cmppahv5m0000lsi0s00jywp3` (`ben@titandiamond.net`) was selected as the
  canonical identity.
- Duplicate users `cmsruy9q90000mt5im0gdb91z` and
  `cmswgtear0000uuoqtog6jenw` were merged transactionally and deleted only
  after their relationships were moved. The canonical account now owns the
  additional 35 notes, 2 tasks, 5 notifications, and compensation plan. Its
  final audit reports one matching Benjamin account, 11,014 notes, 21 tasks,
  28 notifications, and one compensation plan.
- The duplicate time entry collided with an existing canonical entry on the
  same date; related change requests were preserved against the canonical day
  before the duplicate row was removed. Compound monthly-goal collisions are
  also guarded by the maintenance workflow.
- Netlify deploy `6a8972f7cff5180008fefee3` published the guarded maintenance
  workflow from production commit `e518183139a69530a99328238803136e1a658a45`.
- The requested all-time invoice cost and commission recalculation remains
  intentionally paused. No invoice cost-processing, commission-recalculation,
  or Zoho cost-sync endpoint was called during the identity repair.

## 2026-08-22 master-derived cutout Netlify release

- A verified Netlify database recovery backup was created before release at
  `backups/netlify-20260822-033731.dump` (33.77 MB). No migration, catalog data
  mutation, cost sync, or commission process was run.
- Scoped production commit `55160b1594ea383867ff3de693bfaa053bde2734`
  added the 358 approved master-derived transparent product cutouts, the guarded
  rebuild tool, updated image map, direct Signature paths, and larger storefront
  product presentation. Unrelated local `deno.lock` was excluded.
- Netlify deploy `6a897d317646130008917059` published successfully at
  2026-08-22 10:46 UTC with plugin status `success`. Live HTTP checks returned
  200 for `/`, `/shop`, `/signature-series`, `/api/public/products`, and
  `/login`. The CDN Dragon asset was verified as 1200×1200 RGBA with genuine
  transparent and opaque pixels, and desktop/mobile visual checks confirmed
  the blade fills its presentation area without a background.

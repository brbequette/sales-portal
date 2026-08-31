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

- **Canonical invoice counting rule (2026-08-31):** an invoice counts as a sale
  at any status — draft, sent, unpaid, overdue, partially paid, paid — and is
  excluded only when cancelled or voided. The rule lives in
  `src/lib/document-status.ts`, mirrored at
  `netlify/functions/lib/document-status.ts` because functions cannot import
  from `src/lib` at runtime. Every sales, profit and commission aggregation
  imports from it; do not re-type status lists inline.
- Company MTD sales are invoice-only. Sales orders belong to the pipeline tile;
  adding them into MTD double-counts revenue that has already been invoiced.
- Month windows for MTD use UTC month bounds (`utcMonthRange()`), not Arizona
  07:00-UTC bounds, because Books date-only values are stored at 00:00/12:00 UTC.
- The `Invoice.computedFinal` column is corrupted on historical rows (it holds
  the full invoice total on some records instead of the 50% final payout).
  Never sum it into commission; use `plannedInvoiceCommission()`.
- Company-labelled totals must include unassigned/house-account invoices and
  reps hidden from the TV board, or the same screen shows two different MTDs.
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

## 2026-08-24 intro-offer rebuild and real-order semantics

- `/intro-offer` now presents the live catalog offer for SKU `IF30PV1412E-PP` (`THE PATRIOT PRO`) at the authoritative $99.99 pack price: buy one 14-inch blade and receive the second blade free, with free freight.
- The landing page was rebuilt with the official Titan brand system, real product imagery, responsive offer summary, accessible delivery form, commercial-invoice review, and representative-assisted completion.
- Fabricated countdowns, synthetic live-order activity, unsupported savings/performance claims, and external stock-video dependencies were removed.
- Intro-offer pricing and pack limits are server-owned in `src/lib/intro-offer.ts`; the API ignores client-supplied pricing and recomputes the total.
- The public request endpoint validates contact and shipping details and persists a high-priority sales task containing the exact SKU, quantity, total, delivery address, and requested fulfillment method.
- Intro-offer requests now return `PENDING_CONFIRMATION`. They never report a card as charged or commercial credit as approved; no card data is collected on the page.
- TypeScript, targeted ESLint, and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.
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

- **Backfill still owed (2026-08-31).** The invoice sync bugs below are fixed
  in code, but the delta sweep only asks Zoho for records modified since
  `books_sync_cursor`, so previously-skipped invoices will not reappear on
  their own. A one-time `POST /api/internal/books-sync` with
  `{"fullYear": 2026}` is required to backfill, and has not been run.
- **Zoho Books → Postgres August 2026 sync gap (root-caused 2026-08-31).** The Books
  API returns 52 August invoices; the database holds 44. Per-rep totals diverge
  in both directions (Montgomery Morgan reads about $4.9k high locally, Ross
  Haisler about $13.3k low), invoice 10943 carries a grand total identical to
  another invoice's, and 25 August rows have a null `invoiceNumber`. This is a
  data-freshness problem, not an aggregation problem, and it is the remaining
  reason portal totals differ from the Books report. Root causes found and
  fixed: `syncInvoicePayments` threw on any failed payment fetch and aborted
  the entire invoice write (invoice-only path — sales orders have no payments
  call, which is why they synced fine), documents for customers with no local
  Account were skipped on every run instead of having the Account created, and
  `isStale` treated a missing Zoho timestamp as proof of freshness.
- Zoho's "Sales by Salesperson" report excludes drafts and reports grand total
  minus tax, while the portal counts drafts and reports line-item subtotals.
  The two figures are expected to differ; this is not a bug to chase.

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

## 2026-08-22 field-work hero and unified use-case release

- A verified production database backup was created before deployment at
  `backups/netlify-20260822-044854.dump` (33.77 MB). No database record,
  migration, cost, commission, or Zoho data was changed.
- Production commit `2d2c8c4508bcaa1c8ad18e711c045ad672e89da3` added 15 unique
  2048x1152 cinematic field-work hero scenes and assigned them across the public
  routes. The reproducible generator is `scripts/generate-public-hero-series.ps1`.
- Public product application and material presentation now resolves through one
  controlled `Cuts / Application` taxonomy. The API retains backward-compatible
  fields and does not rewrite the underlying raw application, material, or vendor
  data. Manufacturer remains stored but is not exposed as a public facet.
- Follow-up production commit `6bf342409fbd68fa277351b63f1c1f09ddbe1bfa`
  removed the last client-side legacy aliases (`Metal`, `Stone`, and `Masonry`)
  so only their controlled equivalents are presented.
- Netlify deploy `6a8990271f55de00089ff3fb` published successfully at
  2026-08-22 12:06 UTC. Live checks returned HTTP 200 for the public pages,
  generated hero assets, and product API. The production API returned 4,108
  products with `useCases`; live visual inspection confirmed the unified facet,
  controlled labels, product load, hero layering, and absence of legacy aliases.

## 2026-08-23 image-backed public catalog rule

- Public storefront feeds must return only products with a resolved, non-placeholder
  product image. Resolution prefers the maintained SKU image map, then a stored
  product image URL, then a valid image embedded in the legacy description.
- The storefront must not invent generic category or guessed SKU image paths for
  products lacking artwork. Internal/admin product records remain unchanged and
  continue to include image-less items for catalog cleanup.
- Homepage and Signature Series SKU/variant lists include only image-backed
  variants, preventing image-less product configurations from being advertised.

## 2026-08-23 Pioneer price-guide SKU image attachment

- The embedded product images in `Pioneer Titan Diamond PRICE GUIDE 2023 (2).xlsx`
  were reconciled to exact normalized Product SKUs. The duplicate `ORIGINAL QUOTE`
  reference tab and ambiguous candidates were excluded.
- A verified Netlify production database backup was created before mutation at
  `backups/netlify-20260823-172135.dump` (33.77 MB).
- 282 Product records were updated with SKU-matched `imageUrl` values referencing
  69 unique prepared assets; the guarded post-write audit verified all 282 values
  with zero mismatches. All 282 records previously had an empty `imageUrl`. The
  initial background-removal treatments and the white-canvas `studio-v3` set were
  rejected after checkerboard review. Database paths and the SKU image map now
  target `transparent-v4`: 69 AI-segmented, undistorted 1200×1200 RGBA PNGs with
  genuine transparent backgrounds. Five difficult reflective/white-on-white
  sources were rerun through the higher-fidelity BiRefNet model before approval.
  Experimental `cutouts`, `cutouts-v2`, and `studio-v3` are not approved for use.
- Prepared masters/cutouts live under
  `public/product-images/pioneer-price-guide/transparent-v4/`, and the same 282 SKU mappings were
  added to `src/lib/image-map.json`. These files are local and require a scoped
  application release before the new relative URLs are available on the Netlify
  storefront. Do not treat the database write alone as a completed asset deploy.
- Before release, production was backed up to
  `backups/netlify-20260823-170153.dump` (33.77 MB). No database rows or
  migrations were changed. Production commit
  `9feed3acb5780abb4d951ad768b110ff916cb609` published as Netlify deploy
  `6a8b8a281eecab000895b15a` on 2026-08-24 00:06 UTC.
- Live verification returned 456 public products, zero missing or placeholder
  image URLs, and 24/24 initially visible product canvases successfully rendered
  at 900x900. The prior public feed exposed 4,108 records.

## 2026-08-23 Zoho SSO navigation repair

- The unified employee/admin login must let NextAuth perform the Zoho OAuth
  redirect exactly once. NextAuth v4 does not support `redirect: false` for
  OAuth providers; combining it with a manual `window.location.assign` caused
  the visible reload/bounce before leaving the login page.
- Employee and administrator Zoho sign-in now use the standard single redirect
  and accept only relative, same-site callback paths. Production provider
  discovery confirms both sign-in and callback URLs use `www.tdusales.com`.
- Production backup `backups/netlify-20260823-171445.dump` (33.77 MB) was
  created before release. Commit `39e22c75f36c193b26cb899ddf9ae08d2be1a229`
  published as Netlify deploy `6a8b8d2e5d15680008ae6d80` at 2026-08-24
  00:18 UTC with no migrations. A live employee-login button test handed off
  directly to `accounts.zoho.com` once with the callback fixed to
  `https://www.tdusales.com/api/auth/callback/zoho`.

## 2026-08-23 PRODUCT DATA workbook comparison and image attachment

- `PRODUCT DATA.xlsx` was treated as source data only. It contains 1,664 product rows, 1,646 unique normalized SKUs, 1,617 image placements, and 196 unique embedded image assets.
- Exact case-insensitive SKU comparison (with `TDU-` prefix normalization) against the authoritative local Docker production database found 1,541 matched rows and 123 workbook rows without a database match. Four normalized SKUs are duplicated in the workbook.
- All 196 unique assets were extracted to `public/product-images/product-data/masters/` and processed into true-alpha PNGs under `public/product-images/product-data/transparent-v1/`. Automated alpha verification passed 196/196 files.
- Existing product artwork was preserved. Of 1,521 matched rows carrying workbook artwork, only SKU `SHM0406` lacked a usable database image. After backup `backups/tdgpt-20260823-180155.dump`, its guarded `Product.imageUrl` update was applied as `/product-images/product-data/transparent-v1/shm-69ea4ac9f1.png`; the live asset returned HTTP 200 after the app container restart.
- `src/lib/image-map.json` now includes the same `SHM0406` mapping. The reviewed comparison workbook is at `outputs/01a03115-8fc6-77c2-9899-b7cfb56f2014/Product Data Database Comparison.xlsx`. No price or cost conflicts were written to production.

## 2026-08-23 PRODUCT DATA circular blade reconstruction v4

- The initial `transparent-v1` PRODUCT DATA cutouts were rejected after circularity QA showed that background removal had deleted real blade segments and left surviving metal semi-transparent.
- The approved replacement set is `public/product-images/product-data/circular-v4/` (196 PNGs). Round-blade geometry is inferred from original-image evidence, restoration is limited to the outer blade annulus, every restored source pixel is made opaque, and known composites/ring diagrams are explicit pass-through exclusions. Intentional gullets, slots, and arbor holes remain transparent.
- Full validation found 196/196 nonblank RGBA files with genuine transparent pixels. The largest repairs were reviewed old-versus-new on checkerboards; the known damaged `SMXMP` blade now has a complete circular segment envelope.
- A fresh self-hosted production backup was created at `backups/tdgpt-20260823-192718.dump`. Only SKU `SHM0406` was switched from the rejected v1 path to `/product-images/product-data/circular-v4/shm-69ea4ac9f1.png` using an exact guarded update. The live asset returned HTTP 200 (`image/png`, 765,304 bytes) after the app-container restart.
- `src/lib/image-map.json` uses the same `SHM0406` circular-v4 path. The rejected `transparent-v1`, experimental `circular-v2`, and `circular-v3` directories must not be used for new mappings.

## 2026-08-24 communications automation foundation

- The sales communications automation plan from the Codex task `Plan sales communication automation` is the active design direction. Implementation remains development-only; no migration was applied and no production communication or deployment occurred.
- Migration `20260824120000_communications_automation_foundation` adds an append-only `CommunicationEvent` index for unified account timelines, reviewable `SalesCommitment` records, and `AutomationRecommendation` proposals with simulation, approval, rejection, and audit fields.
- Existing call, SMS, email, task, and campaign records remain authoritative. The new timeline is an index rather than a replacement, preventing destructive data consolidation.
- AI-discovered automations default to `DRAFT_ONLY`; no proposed rule may send a message, change authoritative customer data, or become automatic without an explicit review workflow.
- Prisma schema validation passes. Follow-up work must add authenticated timeline/recommendation APIs, idempotent missed-call and voicemail processors, structured transcript extraction, the approval inbox UI, and development migration/testing before any production decision.

## 2026-08-24 communications foundation production release

- The full current working tree passed the Next.js 16.2.6 production build, TypeScript validation, all 311 static pages, Prisma validation, and route generation after an explicit authentication return-type fix in the automation recommendation API.
- Mandatory backup `backups/tdgpt-20260824-052415.dump` (40.27 MB) was created before deployment. Migration `20260824120000_communications_automation_foundation` was applied successfully as the eighth self-hosted production migration.
- The guarded self-host deployment rebuilt both Docker images, restarted the application and Books sync worker, and passed health checks at `http://localhost:3000/login` (HTTP 200). Unauthenticated checks correctly returned HTTP 401 for the new timeline and automation recommendation APIs.
- The Docker build context was 4.85 GB and caused a very slow release. Narrowing the Docker context and existing dynamic admin-image filesystem traces remains a performance follow-up; the warnings did not prevent compilation or runtime health.

## 2026-08-24 communications automation workflow increment

- `src/lib/communication-automation.ts` now idempotently indexes Zoho Voice call records into the unified timeline. Missed inbound calls and voicemails create one high-priority callback task due in ten minutes plus a `DRAFT_ONLY` automation recommendation; no customer message is sent automatically.
- The Zoho Voice webhook calls the safe follow-up processor after its existing call-log upsert. Structured call analysis now extracts transcript-grounded outcomes, decision-maker status, products, equipment, applications, competitors, objections, buying intent, recommended channel/timing, commitments, and proposed account updates.
- AI findings are stored as timeline metadata. Commitments are created with `PROPOSED` status and account updates remain proposals; neither silently changes authoritative account data.
- Administrator route `/api/admin/communications/index-events` can idempotently index recent calls, SMS/MMS, and account-linked email records. `/admin/automation-opportunities` provides the human review inbox for approving drafts, pausing, or rejecting with a reason.
- `/sales/todays-calls` and `/api/sales/todays-calls` provide an ownership-filtered priority queue based on overdue tasks, promised next actions, call inactivity, reactivation timing, recent communication intelligence, and missing phone data.
- The full Next.js production build and TypeScript validation pass with 315 static pages. Existing broad admin-image filesystem trace warnings remain nonblocking.

## 2026-08-24 communications workflow production release

- Mandatory backup `backups/tdgpt-20260824-061251.dump` (40.28 MB) was created before deploying the call-indexing, missed-call workflow, structured call intelligence, automation inbox, and Today's Calls workspace. All eight migrations remained current; no additional database migration was needed.
- The guarded production workflow rebuilt both images, restarted the app and Books sync worker, and passed health checks. Live `/login` returned HTTP 200; the two protected pages redirected unauthenticated visitors (HTTP 307), and the Today's Calls API returned HTTP 401 without a session.
- The release sends no automatic customer messages. Missed-call SMS remains a draft action, AI commitments remain `PROPOSED`, and approved automation recommendations remain `DRAFT_ONLY` until a separate audited rule compiler is implemented.
- Existing historical communication events are not automatically bulk-indexed during deployment. An authenticated administrator must invoke `/api/admin/communications/index-events` in reviewed batches; new Zoho Voice webhook events index automatically.

## 2026-08-24 Zoho Voice provider correction

- Desktop phone links now try the installed ZDialer integration first and the official Zoho Voice browser WebSDK second. A call is reported as started only after one of those providers accepts it; otherwise the number is copied with an explicit fallback message.
- `/api/calls/make` no longer fabricates a manual call ID or claim that the server placed a call. It returns provider capability and normalized call configuration with `placed: false`.
- The optional browser key is `NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY`. The production domain must also be allowlisted in Zoho Voice. This public WebSDK key is distinct from OAuth credentials and must not replace them.
- Without the WebSDK key or ZDialer browser integration, desktop calls intentionally fall back to copy-to-dial; mobile continues to use the native `tel:` handler. This limitation must not be represented as a verified provider call.

## 2026-08-24 Zoho Voice provider production release

- Mandatory backup `backups/tdgpt-20260824-064941.dump` (40.28 MB) was created before deployment. Both Docker images rebuilt successfully, all eight migrations remained current, and the application plus Books sync worker restarted successfully.
- Live health checks passed: `/login` returned HTTP 200 and protected Today's Calls and automation recommendation APIs returned HTTP 401 without a session. The app and PostgreSQL containers report healthy.
- `NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY` is not currently configured in production. Therefore production desktop dialing currently requires the ZDialer browser integration and otherwise falls back to copying the number; native mobile `tel:` dialing remains available.
- No automatic customer message sends were enabled by this release.

## 2026-08-24 communications real-data integrity correction

- Communication UI and server paths must represent only confirmed provider/database facts. No synthetic IDs, optimistic outbound messages, simulated channel success, or click-only call timestamps are permitted.
- The primary SMS UI now calls `/api/send-sms` and adds an outbound message only after Zoho returns a non-empty, non-failure response and the server persists a real `SmsMessage` row. The UI uses that row's actual ID, body, and timestamp.
- Zoho SMS response checks normalize error/failed statuses and codes. Failed or empty provider responses do not create successful outbound message records.
- Contact notes now use `/api/add-note`; they no longer reuse the SMS action. Unconfigured email and WhatsApp actions return HTTP 501 and create no communication note. Legacy `INITIATE_CALL` returns a conflict and no longer mutates `lastCalledAt`.
- Historical indexing remains source-only and idempotent: it references existing `CallLog`, `SmsMessage`, and account-linked `Email` IDs. It does not seed or invent communication activity.
- The full Next.js 16.2.6 production build, TypeScript validation, and all 315 generated pages pass before deployment.

## 2026-08-24 communications real-data production release

- Mandatory backup `backups/tdgpt-20260824-075750.dump` (40.28 MB) was created before deployment.
- The guarded release rebuilt both images, confirmed all eight migrations were current, restarted the app and Books sync worker, and passed the live `/login` health check.
- No provider test communication was sent. Verification was intentionally non-sending; the release prevents false success and synthetic activity but does not by itself prove external delivery without an authorized test recipient.
- Production communication records now require persisted source rows and, for new outbound SMS, an accepted non-failure Zoho response.

## 2026-08-24 final communications mock-path removal

- Non-SMS campaign sends and test sends now return HTTP 501 before creating blasts, notes, campaign success logs, or synthetic activity. The prior mock-success branches were removed.
- Campaign SMS test responses use normalized Zoho failure detection and require a non-empty provider response before reporting success.
- New `/api/calls/log` records require a real provider `zohoCallId`; the API no longer generates `zv_log_<timestamp>` identifiers. `lastCalledAt` updates only for completed outbound calls.
- Account Dialer no longer posts a click-only call log. Power Dialer now starts only through ZDialer or the official Zoho Voice WebSDK and pauses with an error if neither provider accepts the call.
- Full Next.js 16.2.6 production build, TypeScript validation, and all 315 generated pages pass.

## 2026-08-24 final mock-removal production release

- Mandatory backup `backups/tdgpt-20260824-092519.dump` (40.28 MB) was created before deployment.
- Both production images rebuilt, all eight migrations remained current, the app and Books sync worker restarted, and `/login` passed live health verification.
- Deployment verification sent no communication and created no campaign, call, SMS, email, or WhatsApp activity.
- Real external delivery remains unverified until an explicitly authorized test recipient is supplied; the system must not infer delivery from a local success state.

## 2026-08-24 Zoho Mail and real-event indexing completion

- Production has configured `ZOHO_MAIL_ACCOUNT_ID`, `COMPANY_FROM_EMAIL`, and Zoho OAuth refresh credentials. Existing `EmailInbox` uses the real `/api/emails` Zoho Mail send path.
- Outbound email persistence now requires Zoho to return a real provider message ID. The prior `sent_<timestamp>` fallback was removed; a missing message ID produces an error and no outbound `Email` row.
- `/admin/automation-opportunities` now exposes an administrator-only `Index real records` action. It indexes up to 1,000 existing calls, SMS/MMS messages, and account-linked emails per run using their source database IDs and idempotent upserts.
- The indexing action reports exact source counts and never sends a communication or seeds synthetic activity.
- Full Next.js 16.2.6 production build, TypeScript validation, and all 315 generated pages pass.

## 2026-08-24 Zoho Mail and indexing production release

- Mandatory backup `backups/tdgpt-20260824-095118.dump` (40.28 MB) was created before deployment.
- Both images rebuilt, all eight migrations remained current, the application and Books sync worker restarted, and the live `/login` health check passed.
- Production now includes strict Zoho Mail provider message-ID persistence and the administrator-controlled real-record indexing action.
- Deployment verification sent no communication and did not execute historical indexing automatically.
- `NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY` remains unconfigured; desktop browser calling still requires ZDialer unless that public WebSDK key and domain allowlist are supplied.

## 2026-08-24 executive dashboard real-data repair

- The executive modal no longer depends on the generic dashboard payload whose empty state prevented the real rep-stat board from rendering.
- `ExecutiveRepStats` loads Today, This Week, MTD, and YTD concurrently from the existing authenticated `/api/get-rep-stats` service; it introduces no synthetic totals and does not duplicate accounting calculations.
- The view shows billed subtotal, dead profit, net profit after VIG, commissions, invoice counts, average invoices, margins, YTD uninvoiced sales-order pipeline, estimated pipeline commission, and a per-rep period leaderboard.
- Company and individual-rep scopes continue to use the executive modal's existing View As selector.
- Invoice totals retain existing business rules: void/draft documents are excluded, denormalized computed fields are preferred, legacy records use established fallbacks, and paid/upfront commission treatment is preserved.
- Full Next.js 16.2.6 production build, TypeScript validation, component lint, and all 315 generated pages pass before deployment.

## 2026-08-24 executive dashboard production release

- Mandatory backup `backups/tdgpt-20260824-101537.dump` (40.28 MB) was created before deployment.
- Both production images rebuilt, all eight migrations remained current, and the app plus Books sync worker restarted successfully.
- The live `/login` health check passed at `http://localhost:3000/login`.
- Production now serves the real-data executive period scorecard and rep leaderboard.

## 2026-08-24 product web-visibility controls

- `Product.showOnWeb` is the persistent public-catalog visibility flag and defaults to true for ordinary products.
- Migration `20260824170000_product_web_visibility` sets every existing gift product to `showOnWeb = false`; gift rows and accounting history are preserved, not deleted.
- The public products API requires both `giftItem = false` and `showOnWeb = true`.
- Administrators can toggle Show on web directly on every internal catalog row and in both product editors. Marking a product as a gift forces web visibility off.
- Zoho product reseeds preserve manually hidden ordinary products and force synchronized gift products off the web.
- Prisma validation, TypeScript validation, the full Next.js 16.2.6 production build, and all 315 generated pages pass before deployment.

## 2026-08-24 product web-visibility production release

- Mandatory backup `backups/tdgpt-20260824-110524.dump` (40.28 MB) was created before deployment.
- Migration `20260824170000_product_web_visibility` applied successfully as the ninth production migration.
- Both images rebuilt, the app and Books sync worker restarted, and the live `/login` health check passed.
- Read-only production verification returned zero rows where both `giftItem` and `showOnWeb` are true.

## 2026-08-24 sender-number refresh repair

- Production stores three configured Zoho sender-number records; the missing campaign option was caused by a 24-hour browser cache, not failed persistence.
- Campaign and message sender selectors now fetch the authenticated `zoho_phone_numbers` setting with `cache: no-store`; the campaign composer also refreshes numbers whenever it opens.
- The number-management response now emits `Cache-Control: no-store, max-age=0`, and saving numbers removes the legacy browser cache entry.
- Verification is non-sending: no SMS, MMS, campaign, or provider test was executed.
- TypeScript and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.

## 2026-08-24 sender-number refresh production release

- Mandatory backup `backups/tdgpt-20260824-112444.dump` (40.28 MB) was created before deployment.
- Both images rebuilt, all nine migrations remained current, the app and Books sync worker restarted, and `/login` passed its live health check.
- The saved admin form showed four sender numbers while the authoritative setting retained only three; this confirmed a prior persistence loss in addition to the stale browser cache.
- The confirmed fourth form record was restored directly to `zoho_phone_numbers` after the guarded backup, preserving the other entries and the selected default. Read-only verification now returns four records.
- Campaign/message sender selectors no longer use the 24-hour cache and the campaign composer refreshes the database-backed list whenever opened.
- No SMS, MMS, campaign, or provider test was sent.

## 2026-08-24 account duplicate visibility correction

- Production contains 7,935 accounts with unique Zoho IDs; 2,542 are excess rows sharing an exact case-insensitive account name, and 2,779 are excess when punctuation is normalized. These are source CRM records, not duplicate SQL join rows.
- The duplicates became visible when the sales screen began loading the full account set instead of a smaller leading slice.
- The sales account screen now groups exact same-name records after applying the active rep scope. It preserves a real source record as the canonical action target while combining contacts, products, sales, profit, unpaid, overdue, and recent-activity totals from every grouped record.
- No account, invoice, contact, message, task, or commission data was deleted or merged.
- The Zoho account sync no longer limits its existing-name comparison and post-sync account map to 500 records, preventing later records from bypassing the intended duplicate-name guard.
- TypeScript and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.
- Existing source duplicates remain available in PostgreSQL and Zoho for a future audited CRM merge; the current correction is intentionally non-destructive.

## 2026-08-24 cross-page selection and campaign recovery

- The My Sales Pipeline header checkbox selects or clears every account in the current filtered result set across all client-side pages, rather than only the visible 50-row page.
- Campaign progress now recovers the signed-in author’s latest persisted `RUNNING` job when browser local storage lacks the job ID, restoring the global progress pill after reload and resuming from the saved `currentIndex`.
- Campaign status lookup and processing are owner-scoped; an authenticated user cannot recover or advance another author’s job by ID.
- The campaign composer now checks the manager’s returned success flag and does not show a false “started” toast when job creation is rejected.
- Production job `Free Gun Safe` was read-only verified as stalled at 118/2,113 recipients (102 sent, 16 failed), not restarted or duplicated during diagnosis. Recovery resumes at the persisted index after the author reloads the updated app.
- TypeScript and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.
- No campaign message was sent by diagnostic or deployment verification.

## 2026-08-24 select-all and campaign recovery production release

- Mandatory backup `backups/tdgpt-20260824-122702.dump` (40.49 MB) was created before deployment. Both images rebuilt, all nine migrations remained current, services restarted, and the live login health check passed.
- Deployment diagnostics sent no campaign message. The persisted `Free Gun Safe` job remains recoverable from its saved checkpoint when its author reloads the updated application.

## 2026-08-24 administrator campaign visibility and intro-offer readiness

- Strict administrators can recover and observe the latest company-wide `RUNNING` campaign, including its author, totals, sent/failed counts, and persisted progress after a reload.
- Campaign advancement remains single-owner: observer requests set `observeOnly=true`, so additional administrator browsers cannot race the author session and send duplicate recipient chunks.
- The intro-offer page uses repository-tracked product and official-brand images under `public/images`; neither `.gitignore` nor `.dockerignore` excludes these assets, and the production build traces them as static public files.
- The live self-hosted app currently has Zoho and Easyship configuration but no `AUTHORIZENET_API_LOGIN_ID`, `AUTHORIZENET_TRANSACTION_KEY`, or `AUTHORIZENET_PUBLIC_CLIENT_KEY`. Real card capture must remain disabled until all three production gateway values are supplied; the page must not claim that an order is paid meanwhile.
- TypeScript validation and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.

## 2026-08-24 customer self-service account center

- The independent `/customer-portal` shell now includes a desktop and mobile `My Account` destination alongside dashboard, orders, blades, autoship, and tracking.
- Customer JWT account scope remains separate from employee/administrator NextAuth and internal application navigation.
- The account endpoint now returns the authenticated account's contacts and accepts a strictly account-scoped editable profile/address payload.
- Customer edits update the matching Zoho CRM Account and primary Contact first, then commit the same values locally in a Prisma transaction; a rejected Zoho update does not create a divergent local edit.
- Editable fields are limited to company name, primary contact name/email/phones, billing address, and shipping address. Sales quality, ownership, financials, commissions, and other internal fields are never exposed for editing.
- Existing customer order, invoice, autoship, purchased-blade, package, and tracking APIs remain account-filtered by the verified customer JWT.

## Zoho Voice campaign acknowledgement incident (2026-08-24)

- Production campaign `cmt7lst8c0001rutvnm7gnh2v` (Free Gun Safe) completed 2,113 recipients and locally recorded 1,900 successes / 243 failures from `+14325381379`, but Zoho Voice Logs did not show the campaign sends. The prior sender treated any HTTP 2xx response without exact lowercase `error` fields—including empty or non-confirming responses—as success, so those 1,900 records are not reliable proof of provider acceptance or delivery.
- All outbound SMS paths now use `netlify/functions/lib/zoho-sms-response.ts`. A send counts as accepted only when Zoho returns an explicit positive status/code or provider message ID; empty, malformed, ambiguous, HTTP-error, and explicit failure responses remain failures with a provider-facing reason.
- Do not automatically resend the affected campaign. Confirm actual Zoho delivery/log evidence first to avoid duplicate customer messages. Historical local message/log rows are preserved for audit and should be labeled unverified in a follow-up reconciliation rather than deleted.

## 2026-08-24 homepage Signature Series correction

- The public homepage previously rendered two consecutive Signature Blade showcases: the real-data 12-family carousel followed by a redundant static four-family teaser. The duplicate teaser was removed so the front page has one authoritative Signature section.
- Homepage Signature products now require `giftItem = false` and `showOnWeb = true`. Family inclusion uses real visible product rows while the verified tracked family artwork supplies the presentation image, so an empty legacy product image column does not hide Maximus or Gladiator.
- The Featured Signature link now opens `/signature-series` instead of the generic shop.
- Desktop cards use a consistent three-column grid without the prior uneven spans and gaps; tablet remains two columns and mobile retains horizontal snap scrolling.
- All 12 family artwork files returned HTTP 200 from production before the change. The full Next.js 16.2.6 production build, TypeScript validation, and all 316 generated pages pass after the correction.

## 2026-08-25 Netlify preview reconciliation

- Local Docker production remains healthy at `http://localhost:3000/`, and GitHub branch `codex/production-portal-updates` is clean at commit `6f17ff34`.
- Netlify production is still configured to build `brbequette/sales-portal` branch `main`; it has not been switched or overwritten.
- A new Netlify Linux branch preview built commit `6f17ff34` successfully as deploy `6a8d4cfbacc501000856cbee`. `/signature-series` and tested Signature blade assets return HTTP 200.
- The preview homepage returns HTTP 500 because Netlify's separate PostgreSQL database lacks migration `20260824170000_product_web_visibility`; server logs report PostgreSQL `42703` for missing `Product.showOnWeb`.
- Do not bypass `showOnWeb`, promote this preview, or silently migrate the Netlify production database. A controlled Netlify database backup/snapshot and migration plus an explicit production-branch decision are required before promotion.

## 2026-08-25 Netlify production reconciliation completion

- The user explicitly approved the Netlify application-database migration and production-branch switch.
- Netlify's managed database snapshot `snap-autumn-wildflower-aj4lqgpl` was created first, but inspection showed that connector contained only Netlify migration metadata and not the application's `Product` table. No application schema change was attempted against that unrelated database.
- Before altering the actual protected application database, a guarded one-time cloud build created rollback table `ProductWebVisibilityBackup_20260825`, copied every product ID and prior gift flag, added `Product.showOnWeb BOOLEAN NOT NULL DEFAULT true` only when absent, and hid all gift products. Verification required a non-empty backup and zero rows where both `giftItem` and `showOnWeb` were true.
- The one-time migration hook and script were removed after success. Clean Netlify preview deploy `6a8def7585b0e00009ae92f3` built commit `4912c13daf78faed2466a72b6ad7e58c83f81f82` and passed homepage, Signature Series, public product API, and image checks.
- Netlify production now builds `brbequette/sales-portal` branch `codex/production-portal-updates`. Production deploy `6a8df0f602d8fe78a266b586` published the same commit to `https://www.tdusales.com`.
- Live verification returned HTTP 200 for `/`, `/login`, `/intro-offer`, `/signature-series`, `/api/public/products`, both intro-offer blade images, the horizontal light logo, and representative Dragon and Gladiator Signature artwork.
- Local Docker production remains healthy and the database rollback table is intentionally retained until the web-visibility release has completed its operational observation period.
## 2026-08-25 Zoho SSO post-callback stabilization

- The self-host Zoho authorization request correctly generates `http://192.168.0.108:3000/api/auth/callback/zoho`; the registered callback origin was not the cause of the reload requirement.
- The failure occurred after provider return: NextAuth redirected immediately into the protected dashboard while the installed service worker also intercepted authentication navigation.
- Employee and unified Zoho login now return through public `/auth/complete`, which confirms the newly issued NextAuth session before performing a hard same-origin navigation to the validated relative destination.
- The service worker no longer intercepts `/api/auth/*` or `/auth/complete` navigations. Callback destinations remain restricted to relative, same-site paths.
- TypeScript validation and the full Next.js 16.2.6 production build with all 317 generated pages pass. Existing lint findings in the two legacy login pages predate this repair; the new completion page and proxy changes pass targeted lint.
- Guarded self-host deployment created backups `backups/tdgpt-20260825-131402.dump` and `backups/tdgpt-20260825-131444.dump` (34.25 MB each), rebuilt both images, confirmed all nine migrations current, restarted the app and Books sync worker, and passed the live login health check.
- Post-deploy verification returned HTTP 200 for `/auth/complete` and `/sw.js`; the live provider request retains the registered Zoho callback and stores `/auth/complete?callbackUrl=%2Fdashboard` as the NextAuth destination.
## 2026-08-25 development-only complete shipping cost rollup

- This change is explicitly limited to development and has not been deployed to self-host production, Netlify, or either production-linked GitHub branch.
- Actual shipping now aggregates distinct package/Easyship label charges and manual freight allocations, deduplicating matching tracking numbers and preserving any unexplained legacy amount as an itemized unallocated remainder.
- Invoice package lookup uses the linked sales-order ID/number rather than the invoice ID. Label purchases immediately refresh the linked sales-order and invoice `actualShippingCost` and `shippingCostBreakdown` fields and mark those documents for full cost recalculation.
- Actual shipping is an operational/invoice reporting value only: it is explicitly excluded from dead profit, net profit, margin, and commission calculations. Cost processing still persists the complete shipping total, breakdown, and source rollup metadata to both first-class columns and document JSON.
- Four focused shipping aggregation tests, TypeScript validation, and the full Next.js 16.2.6 build with all 317 pages pass.
- Development branch `codex/dev-shipping-cost-rollup` is running on port 3001. Docker is configured for a LAN-capable bind and `DEV_APP_URL`; Windows LAN forwarding for `192.168.0.108:3001` is configured separately from unchanged production port 3000. The branch remains local and unpushed.
## 2026-08-25 production local-AI recovery

- Titan AI failures were caused by the CPU-only `qwen3:4b` model exceeding the prior 20-second Ollama deadline while processing the tool schema; logs showed the request canceled during prompt evaluation rather than a database or HTTP outage.
- Production now uses the locally stored, tool-capable `llama3.2:3b` model with `OLLAMA_TIMEOUT_MS=180000` in `.env.selfhost`. A representative real-data prompt returned an explicit `query_company_summary` tool call in 33.4 seconds.
- The smaller `qwen3:1.7b` candidate was rejected after testing because it returned empty/non-tool responses and could not be trusted for financial questions.
- Production was restarted using the required `.env.selfhost` configuration. All nine migrations remain current; PostgreSQL and the app are healthy, and `/login` returns HTTP 200. No database records were changed by the recovery.
## 2026-08-25 executive rep-scope production correction

- The executive dashboard previously preferred the impersonated user's email as `repId`; `get-rep-stats` then compared that email to `Account.ownerId`, which stores the canonical local user ID. This prematurely returned zero rows for Ross Haisler and other selected users even when production data existed.
- The client now sends the canonical user ID. The API resolves ID/email/name requests to the canonical user and scopes candidate documents by either account ownership or exact stored salesperson attribution before applying its final rep matcher. This preserves salesperson-attributed invoices when account ownership differs.
- Read-only production verification found Ross Haisler has 220 qualifying 2026 salesperson-attributed invoices totaling $362,584.51 in subtotal; no data repair or document mutation was required.
- Guarded production deployment created backup `backups/tdgpt-20260825-150407.dump` (34.25 MB), built all 317 pages, confirmed all nine migrations current, restarted the app and Books sync worker, and passed the live `/login` health check.
## 2026-08-25 Netlify all-fixes production release

- Netlify site `titan-sales-portal` for `https://www.tdusales.com` is connected to `brbequette/sales-portal`, not the workspace's `brbequette/TDGPT` origin. Commit `12cc79691e6d9a76495cb50f1be9421dc9ff2f97` was fast-forwarded to the connected `codex/production-portal-updates` branch after explicit user confirmation.
- Netlify production deploy `6a8e15c85af9fd0008c1d1e6` completed in `ready` state with no reported error.
- Live verification returned HTTP 200 for `/`, `/login`, `/intro-offer`, `/signature-series`, `/api/public/products`, and representative tracked PNG assets. No new image files were pending in the released commit range; existing repository-tracked images remain available to Netlify.

## 2026-08-25 August production data reconciliation

- Mandatory pre-repair backup `backups/tdgpt-20260825-153731.dump` (34.25 MB) was created before production data changes.
- Live Zoho Books detail records were reconciled against PostgreSQL for all 41 invoices dated August 1–25, 2026. Thirty-two local issue/due date snapshots differed from Zoho and were repaired; seven true August 3 invoices had been stored under July dates, while invoice 10951 was corrected from a false August date to its authoritative June 26 issue date.
- A background full-detail refresh exposed a persistence defect that cleared `computedDeadCost` and `computedDeadProfit`. Thirty-eight August financial snapshots were restored from live Zoho custom fields. Final August verification reports zero missing dead cost, dead profit, net profit, salesperson, sync conflict, pending fetch, or pending cost flags.
- Corrected August totals are 41 invoices overall and 34 active invoices. Active subtotal is $69,734.65; dead cost $37,264.00; dead profit $31,220.17; net profit $27,327.32; and earned/eligible commission $10,273.18.
- Active rep totals: Ross Haisler 18 invoices / $36,571.63 subtotal; Montgomery Morgan 15 / $32,663.04; Benjamin Bequette 1 / $499.98.
- Canonical sync persistence now updates invoice issue/due dates from Zoho and carries dead cost, dead profit, and the correctly named VIG rate through `updateInvoiceRecord`, preventing subsequent detail refreshes from undoing the repair.
- TypeScript validation and the full Next.js 16.2.6 production build with all 317 generated pages pass. Existing broad image-tracing warnings are unchanged.
- Guarded self-host releases created deployment backups `backups/tdgpt-20260825-191352.dump` and `backups/tdgpt-20260825-193136.dump`; both deployments passed all nine migrations, app/worker startup, and localhost/LAN health checks.
- A forced live refresh of invoice 10970 verified the deployed path preserves Zoho issue/due dates, dead cost $78.94, dead profit $121.05, net profit $97.37, and VIG 1.3 with no conflict or pending flags.
- GitHub commit `6e54b2db264a80c0ae83ed45390526cca397af2a` is published to both project repositories. Netlify production deploy `6a8e53c95203d200084e531c` reached `ready` and `https://www.tdusales.com/login` returned HTTP 200.

## 2026-08-28 document status sync and order processing workspace

- Estimate webhook and daily Books synchronization no longer discard draft, sent, accepted, or declined estimates; all estimate statuses now update the local Quote row, while existing conflict detection remains in force.
- The Sales Documents status filter is populated from the actual statuses stored for invoices, estimates, and sales orders instead of a hard-coded cross-document list.
- New authenticated `/processing` workspace groups operational work by stage and supports inline estimate approval, sales-order confirmation, draft-invoice sending, payment recording, and shipment completion with tracking.
- The processing workspace uses the existing document ownership/admin authorization, conflict guard, Zoho Books payment/status endpoints, and local post-action status updates. It is linked from the primary application navigation.
- TypeScript validation and the full Next.js 16.2.6 production build pass with 318 generated pages. Existing broad image-tracing build warnings are unchanged.
- This work is source-only and has not been deployed to local production or Netlify. No Zoho status, payment, shipment, or production data was changed during verification.

## 2026-08-28 processing workspace production release

- Mandatory backup `backups/tdgpt-20260828-110030.dump` (34.26 MB) was created before deployment.
- The self-host production images rebuilt successfully, all nine migrations remained current, the app and Books sync worker restarted, and `/login` passed the guarded health check.
- Live self-host verification returned HTTP 200 for `/processing`; the production build includes the generated processing route.
- No payment, approval, invoice-send, or shipment action was executed during deployment verification.- GitHub commit `c873e133a735d071e09e8dbb7d6d27e6b8ee3585` was pushed to `brbequette/TDGPT` and `brbequette/sales-portal`, including both production branches.
- Netlify production deploy `6a91cfc2e0dbec0008b3c110` reached `ready` for the same commit. Live `/login`, `/processing`, and `/docs` checks returned HTTP 200.

## 2026-08-28 processing center operations-workbench correction

- Replaced the initial processing list with an order-centric operations workbench: stage lanes and a prioritized queue remain visible on the left while the selected order stays open in a persistent command center on the right.
- The command center follows the authoritative lifecycle from accepted estimate through sales-order confirmation, package preparation, tracked shipment, draft invoice, invoice send, external payment recording, and the three-part closeout checklist. Linked packages, invoices, payments, blockers, ownership, balances, profit, and next required action are shown together.
- Queue staging uses actual linked lifecycle/status data and elevates sync conflicts or incomplete cost processing into an exception lane. Payment copy explicitly records externally received funds; it does not imply that the portal charges a card.
- Document conversion now enforces the same account-owner/admin authorization and Zoho sync-conflict guard used by other document writes. Shipment completion requires tracking and updates linked Zoho/local package tracking, carrier, and shipped status as well as the sales order.
- Docker builds now exclude verified local-only AI/work folders so deployment context does not include unrelated model caches.
- TypeScript validation, focused processing-page lint, and the full Next.js 16.2.6 production build pass with all 318 generated pages. Existing broad image-tracing warnings are unchanged.
- Mandatory release backups include `backups/tdgpt-20260828-113315.dump`, `backups/tdgpt-20260828-113432.dump`, `backups/tdgpt-20260828-114047.dump`, and final pre-release backup `backups/tdgpt-20260828-114114.dump` (34.27 MB). Two guarded attempts stopped before deployment due build-context/WSL readiness checks; no backup guard was bypassed.
- The successful image build found all nine migrations current. A transient Docker container-removal race during restart was resolved by rerunning the standard start script; the app and Books sync worker are healthy and live `/login` and `/processing` checks return HTTP 200.
- No estimate approval, conversion, shipment, invoice send, payment, or closeout action was executed during release verification.
## 2026-08-28 admin-only sales-order processing boundary

- The Order Processing Center is restricted to strict administrators at both the page route and pipeline API; manager, collections, sales representative, and viewer roles cannot open it or load its queue.
- The workspace begins only after an estimate has been converted to a sales order. Estimates and estimate acceptance/conversion actions are excluded, and downstream invoice work is limited to invoices linked to a sales order.
- Order Processing navigation is hidden from non-administrators on desktop and mobile. Existing estimate tools elsewhere in the portal are unchanged.
- The screen is not a Collections workflow: sent invoices leave the queue, and payment recording, overdue follow-up, and closeout remain on the separate Collections screen.
- The combined release attempt was stopped during image build before migration or restart when this requirement changed. Its mandatory backup `backups/tdgpt-20260828-115158.dump` (34.27 MB) is retained; the corrected release is pending validation and deployment.
## 2026-08-28 TV daily rep subtotal and dead-profit cards

- Every Monday-Friday cell for every displayed representative now shows two explicit values in the same box: SUBTOTAL and DEAD PROFIT.
- The values continue to come from the authoritative weekly dashboard payload, which uses stored computed dead profit and the existing custom-field extractor fallback; no financial formula changed.
- Pending cost processing is displayed as a separate warning and no longer replaces or hides the dead-profit value.
- Focused lint passes with only the existing logo image warning, and TypeScript validation passes. This change is source-only until deployed.
## 2026-08-28 collections manager queue authorization

- The company Collections Manager is assigned through the `collections_manager_id` system setting; this does not change the user's general sales role.
- The Collections endpoint recognizes the assignment and grants the selected manager the company-wide overdue-invoice queue while ordinary sales representatives remain restricted to accounts they own.
- Brian Basiliere's public assignment was verified against his local user ID. No invoice, account, user, payment, or collections data was changed.
## 2026-08-28 order processing workstation and calendar-date correction

- The admin-only Order Processing screen is an order workstation: selecting a queue item keeps the order open and shows its line items, SKUs, quantities, rates, totals, customer contact, billing and shipping addresses, reference number, blockers, financial snapshot, linked packages/invoices, and the valid fulfillment/billing actions in one view.
- Processing still begins only with sales orders; estimates and Collections work remain outside this screen.
- Zoho document dates are treated as calendar dates in the workstation rather than UTC instants, preventing Arizona formatting from displaying the previous day.
- The linked-document invoice date tool now uses inclusive UTC calendar-day boundaries, so rows stored at midnight or noon remain inside the selected range. Applied invoice dates continue to use noon UTC and do not alter Zoho source-document dates.
- TypeScript, focused lint, and the full Next.js production build with all 318 pages pass. Guarded self-host deployment created backup `backups/tdgpt-20260828-121704.dump` (34.27 MB), found all nine migrations current, restarted the app and Books worker, and passed live `/login` and `/processing` health checks. Commit `f95fffd9` was published to the `codex/production-portal-updates` branch in both production repositories; public `https://www.tdusales.com/login` and `/processing` returned HTTP 200 after publication.
## 2026-08-28 Brian Basiliere Collections production correction

- Local production contained 80 eligible open collection invoices, but `collections_manager_id` pointed to a different user ID. Mandatory pre-change backup `backups/tdgpt-20260828-122951.dump` (34.27 MB) was created, then the single setting was corrected to Brian Basiliere's verified user ID `cmrjk9kyu0000w9cy2nsbfuyc`.
- The Collections response now declares company-wide scope, and the client uses a versioned cache that stores both invoice data and that permission. This removes Brian's stale empty cache and enables the sales-representative filter for the assigned Collections Manager without granting a broader application role.
- No invoice, account, payment, or user record was changed. TypeScript validation and the full 318-page production build pass; existing broad lint debt in the legacy Collections files is unchanged. Guarded deployment created backup `backups/tdgpt-20260828-123453.dump` (34.27 MB), found all nine migrations current, restarted the app and Books worker, and returned HTTP 200 for `/login` and `/collections`.
## 2026-08-28 Processing document-number correction

- The Processing queue now reads the canonical stored `invoiceNumber` / `salesOrderNumber` values before snake-case fallbacks and never substitutes the Zoho record ID when a real document number exists.
- Queue cards and the selected-order header display the actual document value without an artificial `#` prefix. Live verification identified sales orders `46357` and `46529` behind the previously displayed internal IDs.
- TypeScript, focused Processing-page lint, and the full 318-page production build pass. Guarded deployment created backup `backups/tdgpt-20260828-124915.dump` (34.27 MB), found all nine migrations current, restarted the app and Books worker, and returned HTTP 200 for `/processing`.

## 2026-08-28 Microsoft 365 email operational-intelligence foundation

- A read-only, approval-gated Microsoft 365 email ingestion foundation is implemented in source. It reads Inbox and Sent Items through Microsoft Graph application permission `Mail.Read`; `Mail.Send` is not required and secret values remain server environment variables only.
- The new `EmailAttachment` and `EmailOperationalEvent` models retain attachment metadata/classification, deterministic extraction results, source fingerprints, match confidence, conflicts, proposed/applied audit data, and administrator review state. Existing `Email` rows remain compatible while provider-neutral Microsoft message identifiers and mailbox metadata are added.
- Deterministic extraction currently recognizes shipment confirmations, freight bookings and charge components, payment-receipt evidence, customer-contact failures, returns, supplier approval/cancellation events, tariff notices, missing tracking, and address-change requests. Email payment evidence is never treated as authoritative payment confirmation.
- Events match local invoices, sales orders, purchase orders, and packages by their operational identifiers. Every event defaults to `REVIEW_REQUIRED`; approval records a decision only and does not yet mutate any business record. Address changes, cancellations, payments, credits, returns, and ambiguous matches must remain human-reviewed.
- Admin workspace `/admin/email-intelligence` shows connection readiness, the required business/setup checklist, event counts, match/conflict evidence, and approve/reject/reopen controls. `/admin/data-integrations` links to it.
- Microsoft tenant variables required before connection are `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, and `MICROSOFT_CLIENT_SECRET`. Required operational decisions are documented in `docs/EMAIL_INTELLIGENCE_SETUP.md`.
- The email add-on is optional per rep and is managed in User Settings. A rep can self-enroll only the mailbox matching their portal email; administrators retain oversight and must assign additional/shared mailboxes so tenant-wide Graph access cannot be abused to claim another employee's inbox.
- Deployed successfully to local Docker production on 2026-08-28. Migration `20260828210000_email_operational_intelligence` applied, the app and Books sync worker restarted healthy, and `http://localhost:3000/login` passed the deployment health check. Pre-deployment backup: `backups/tdgpt-20260828-133703.dump` (34.28 MB).
- The foundation now supports administrator-managed individual and shared mailboxes. Each mailbox can be assigned to one portal user (and users may have multiple mailboxes), independently enable Inbox/Sent Items, set a history window, enable/disable automatic sync, and retain its own last-sync status/error. One tenant-level Graph application serves the configured mailbox list; no user passwords are stored. `MICROSOFT_MAILBOX_ADDRESS` is now only an optional single-mailbox fallback.
- Prisma validation, generated-client TypeScript validation, focused lint, five extraction fixture tests, and the full Next.js production build pass. The setup screen now includes a specific “Where to get it” source and direct portal link for every required Microsoft, mailbox, sender, identifier, policy, and approval item.
- The setup-guidance update was deployed successfully to local Docker production on 2026-08-28. Mandatory backup `backups/tdgpt-20260828-134814.dump` (34.29 MB) was created; all ten migrations were current, the app and Books worker restarted healthy, and the live LAN `/admin/email-intelligence` page was verified to show all eleven guidance cards and seven source links.
## 2026-08-28 cross-environment Brian Collections identity

- The user explicitly approved `brian@titandiamond.net` as the exact cross-environment Collections Manager identity because local and Netlify databases can assign different internal user IDs.
- Collections authorization still honors the configurable `collections_manager_id` first; the verified Brian email is an additional exact match granting company-wide Collections data only, not administrator access or unrelated permissions.
- This correction is live on the public Netlify portal, where the local database ID assignment cannot be assumed to match. Production deploy `6a91edac638a36000877f1e8` published commit `fbc622fb8b2f86047b57bc81a86a1d3f5dc195c2` in `ready` state; public `/collections` returned HTTP 200. No invoice, payment, account, or user record was changed.
## 2026-08-28 Collections cache-shape crash correction

- Brian's public Collections page error `c.forEach is not a function` was caused by the client writing a structured cache object but reading it as an invoice array.
- The cache reader now validates and supports both legacy arrays and structured cache payloads, restores the manager-scope flag only from a valid object, and uses the `collections-v4` namespace so existing malformed session data is bypassed immediately.
- TypeScript validation passes. Netlify production deploy `6a91f49a418757000837b8dd` published commit `75e574c78e2a67a91e723e03e3150c04326d4b9f` in `ready` state, and public `/collections` returned HTTP 200. No Collections or customer data was changed.
## 2026-08-28 Collections route forced-scope correction

- Brian's company-wide authorization was working inside `get-collections`, but the Next.js route adapter forcibly injected Brian's own user ID as `repId`; the manager-aware endpoint then treated that as an explicit rep filter and returned his zero owned-account invoices.
- `/api/get-collections` no longer forces representative scope at the adapter. The endpoint remains authenticated and is solely responsible for applying admin, exact Collections Manager, or ordinary owner scope.
- The browser cache namespace advanced to `collections-v5` so Brian's previously cached empty authorized response is bypassed immediately. TypeScript validation passes.

## 2026-08-29 Signature Series legendary hero

- `/signature-series` now has a dedicated full-bleed cinematic hero rather than relying on the faint route-wide atmosphere. The final 2048×1152 asset is `public/images/hero/field-series/signature-series-legendary-v2.jpg` and was generated in approved Image API edit mode with `gpt-image-2`, using the existing field photograph for realism and the Dragon, Zeus, and Medusa blade cutouts as exact product references.
- The composition keeps the active concrete cutter and live demolition cut on the right, works the specialized blade identities into the left-side jobsite structure, and preserves a deliberately dark central text-safe field. Layered responsive shading, text shadows, a restrained 18-second cinematic drift, mobile-specific positioning, and reduced-motion handling preserve readability and accessibility.
- TypeScript and the complete Next.js 16.2.6 production build pass with all 332 pages. The eleven existing broad image-tracing warnings are unchanged. Mandatory pre-deploy Netlify database backup `backups/netlify-20260829-141132.dump` (34.06 MB) was created; this visual-only release includes no schema or data mutation.

## 2026-08-31 Commission board database fan-out correction

- The commission board failure was reproduced locally through the authenticated `/api/get-commissions` route. Missing stored cost fields caused the read request to launch thousands of concurrent cost calculations; each calculation independently loaded settings, users, VIG configuration, and the full product catalog, then queued an unbounded background update. This exhausted Prisma's connection pool and eventually crashed the Next.js process with an out-of-memory error.
- Cost calculations now support a shared prefetched context. Commission requests load the calculation dependencies once and reuse them across all documents, and the board no longer writes calculated values back to the database during a read. Cost persistence remains the responsibility of the existing sync and cost-processing workflows.
- The commission route now declares a 60-second execution window. Its lightweight staleness check no longer uses account ownership as a proxy for commission ownership, because commissions are attributed from the document salesperson.
- Zoho OAuth refresh returned successfully during diagnosis. The connected database also showed invoice and payment updates on 2026-08-31 with no pending invoice, sales-order, or quote fetches, so the shared Books sync was active rather than globally broken.
- TypeScript validation passed. Authenticated local route checks returned HTTP 200 for the full administrator board, a scoped non-administrator board, and the lightweight staleness request without connection-pool exhaustion. No deployment was performed in this task.

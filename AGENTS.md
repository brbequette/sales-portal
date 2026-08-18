<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Titan Diamond Sales Portal

## Quick Reference
- **Database**: PostgreSQL (Prisma schema at `prisma/schema.prisma`, 1,293 lines, 30+ models)
- **API Functions**: `netlify/functions/` (112+ TypeScript serverless functions)
- **Frontend**: Next.js 16 App Router at `src/app/` (24 route groups)
- **Auth**: Custom User model, roles: ADMIN | MANAGER | AGENT | VIEWER
- **Deployment**: Netlify at `titan-sales-portal.netlify.app`
- **ERP**: Zoho Books (Org ID: `664670946`)
- **CRM**: Zoho CRM (Deals, Accounts, Commission Ledgers)
- **Shipping**: Easyship Enterprise API
- **SMS/Voice**: Twilio

## Key Routes
| Route | Purpose |
|-------|---------|
| `/dashboard` | Main admin dashboard |
| `/commissions` | Commission tracking, ledger, payout management |
| `/rep-portal` | Sales rep self-service portal |
| `/shipping` | Easyship shipping center |
| `/tv` | Broadcast mode for office TV displays |
| `/timeclock` | Employee time tracking with geofencing |
| `/catalog` | Product catalog browser |
| `/collections` | Accounts receivable / collections tracking |
| `/tasks` | Task management |
| `/training` | Rep training documentation |
| `/sales` | Sales pipeline views |
| `/admin` | Admin settings, user management, campaigns |
| `/messages` | Messaging center |
| `/tools` | Utility tools |
| `/print` | Print-optimized views (pay vouchers, reports) |
| `/stats` | Statistics & analytics |
| `/docs` | Internal documentation |
| `/customer-portal` | Customer-facing portal |
| `/intro-offer` | Intro offer pages |

## Largest/Most Critical API Functions
| Function | Size | Purpose |
|----------|------|---------|
| `get-accounts.ts` | 60KB | Account list with complex filtering |
| `get-commissions.ts` | 47KB | Commission ledger queries & aggregation |
| `get-rep-stats.ts` | 29KB | Rep performance metrics |
| `zoho-books-webhook.ts` | 28KB | Bidirectional Zoho sync hub |
| `daily-books-sync.ts` | 18KB | Daily full sync from Zoho Books |
| `automation-engine.ts` | 17KB | Scheduled automation engine (every 5 min) |
| `process-invoice-costs.ts` | 16KB | Invoice cost calculation engine |
| `bulk-process-costs.ts` | 16KB | Batch cost processing |
| `shipping.ts` | 16KB | Easyship rate quotes & label purchasing |
| `campaign-job-create.ts` | 15KB | Campaign job creation |
| `send-campaign.ts` | 14KB | Campaign sending engine |
| `vig-history.ts` | 13KB | VIG history management |
| `log-sales-call.ts` | 13KB | Sales call logging |

## Scheduled Functions (netlify.toml)
| Function | Schedule | Purpose |
|----------|----------|---------|
| `automation-engine` | Every 5 min | Process automation queue |
| `daily-books-sync` | Daily 6 AM UTC | Full Zoho Books sync |
| `process-scheduled-messages` | Every minute | Send queued messages |
| `email-sync` | Every 3 min | Sync email activity |

## Environment Variables
```
DATABASE_URL, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
ZOHO_ORGANIZATION_ID (664670946), EASYSHIP_API_KEY,
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
```

## Architecture Notes
- Fixed panels and modals MUST use `createPortal(..., document.body)` to escape overflow clipping
- Zoho API calls should use targeted endpoints (e.g., `/invoices/{id}/payments`) to avoid rate limits
- Batch all Zoho field updates into a single PUT payload per record
- Invoice model has denormalized computed columns (computedProfit, etc.) for fast queries
- Bidirectional sync uses lastZohoModifiedTime/appModifiedAt/syncConflict fields

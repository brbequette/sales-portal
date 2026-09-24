# Admin route inventory and disposition

Audited 2026-09-24 from `src/app/admin`, its imported components, called `/api` and Netlify functions, Prisma-backed handlers, and inbound links. This inventory classifies navigation and ownership; it does not change financial, ownership, automation, or provider business rules.

Legend: **KEEP** is an everyday production control; **MERGE** is represented by a consolidated workspace; **MOVE** remains intact under a better workspace; **ADVANCED** is restricted maintenance; **RETIRE** is a compatibility redirect or a superseded surface retained only to avoid breaking links.

| Route | Purpose / primary dependency | Data or integration impact | Links / overlap | Disposition |
|---|---|---|---|---|
| `/admin` | Control-center landing page | Read/navigation only | App shell | KEEP |
| `/admin/company-settings` | Users, defaults, fields, holidays, time | Cross-company configuration | Replaces People & Time as top-level IA | KEEP |
| `/admin/sales-configuration` | Sales stages, scripts, assignment and activity rules | Accounts, stages, scripts, configuration | Consolidated hub | KEEP |
| `/admin/compensation-center` | VIG, plans, goals, payouts and payroll | Compensation and payroll models | Consolidated hub | KEEP |
| `/admin/automation-ai` | AI provider health, tools and automation domains | AI settings/status; links to automation surfaces | Consolidated hub | KEEP |
| `/admin/communications-center` | Campaigns, templates, creative and logs | Communication/campaign records | Consolidated hub | KEEP |
| `/admin/products-data` | Catalog, product offers, images, autoship and imports | Product/catalog records | Removes product tools from Sales/Operations overlap | KEEP |
| `/admin/integrations` | Zoho, Voice, email and shipping status/policy | External integrations; maintenance link is warned | Replaces mixed Data & Integrations hub | KEEP |
| `/admin/operations-center` | Work queue, shipping and vendors | Operational records | Product/settings links moved out | KEEP |
| `/admin/system-health` | Failures, conflicts, queues and integrity | Primarily read/review; repair pages retain gates | New monitoring/config separation | KEEP |
| `/admin/advanced` | One-time imports, backfills and repairs | Potentially destructive production operations | Removes dangerous tools from primary navigation | KEEP |
| `/admin/users` | Users, roles, assignment and visibility | `User`, accounts, update config | Company Settings | MOVE |
| `/admin/settings` | Global, sync, notification and shipping defaults | Settings/config APIs; test notification action | Company Settings / Integrations | MOVE |
| `/admin/custom-fields` | Local/Zoho custom-field catalog and mapping | Custom-field configuration, Zoho mapping | Company Settings / Products & Data | MOVE |
| `/admin/holidays` | Company holiday calendar | Holiday/workday configuration | Company Settings; linked by VIG builder | MOVE |
| `/admin/timeclock` | Shifts, changes, geofences and admin actions | Timeclock/geofence models | Company Settings | MOVE |
| `/admin/geofences` | Compatibility route to Timeclock geofence tab | None itself | Duplicated by Timeclock | RETIRE |
| `/admin/people-time` | Compatibility route to Company Settings | None itself | Superseded top-level hub | RETIRE |
| `/admin/sales-stages` | Pipeline stages and stage automation flow | Sales-stage/automation configuration; can execute flow | Sales Configuration | KEEP |
| `/admin/scripts` | Representative call scripts | Script templates | Sales Configuration | KEEP |
| `/admin/intro-offer` | Introductory offer configuration/content | Offer settings | Sales Configuration | KEEP |
| `/admin/update-accounts` | Search and reassign any account, with an explicit Update Status-only scope | Account and contact ownership in local PostgreSQL and Zoho CRM | Sales Configuration | KEEP |
| `/admin/lead-discrepancies` | Lead/ownership discrepancy review | Account/lead repair | Sales Configuration / System Health | KEEP |
| `/admin/update-config` | Portal activity, assignment and target defaults | Update configuration; reassignment action | Sales Configuration | KEEP |
| `/admin/product-offers` | Product volume, package and gift tiers | Product offer configuration | Products & Data; removed from Sales hub | MOVE |
| `/admin/vig` | VIG rates/history/configuration | VIG settings/history | Compensation | KEEP |
| `/admin/compensation` | Compensation plans and rep assignments | Compensation plans/users | Compensation | KEEP |
| `/admin/goals-bonuses` | Goals, contests and bonus programs | Goal/bonus configuration | Compensation | KEEP |
| `/admin/payouts` | Commission ledger and payout administration | Commission/payout models; creates/updates/deletes | Compensation | KEEP |
| `/admin/payroll` | Advances, reimbursements and base pay | Payroll records; approval/payment actions | Compensation | KEEP |
| `/admin/rep-stats` | Administrative performance board | Read-only reporting APIs | Compensation; overlaps `/stats` by authorized scope | KEEP |
| `/admin/campaigns` | Durable SMS/MMS campaigns and recovery | Campaign jobs/recipients/attempts; Zoho Voice sends | Communications/System Health; embedded in account workspace | KEEP |
| `/admin/communications` | Voice numbers, calls and communication history | Zoho Voice and local communication logs; sync/reconcile actions | Communications/Integrations | KEEP |
| `/admin/notification-templates` | Reusable notification rules/templates | Notification templates | Communications | KEEP |
| `/admin/flyer-studio` | Campaign creative and promotion drafting | Media/campaign drafts; optional confirmed Zoho publish | Communications; embedded in account workspace | KEEP |
| `/admin/email-intelligence` | Mailbox sync and extracted operations events | Microsoft 365/mail records; sync actions | Integrations/System Health | KEEP |
| `/admin/automation-opportunities` | AI-discovered rule review/approval | Automation recommendations and event indexing | Automation & AI | KEEP |
| `/admin/ai-tools` | Permission-controlled AI tools | AI tool records; create/update/delete | Automation & AI | KEEP |
| `/admin/catalog-import` | CSV product import | Product catalog writes after validation | Products & Data | MOVE |
| `/admin/image-manager` | Shared product/media assets | Media assets / product image references | Products & Data; inbound Product modal link | MOVE |
| `/admin/autoship` | Recurring product bundles | Autoship bundle records | Products & Data | MOVE |
| `/admin/vendors` | Vendor management and synchronization | Vendor records / Zoho vendor sync | Operations | KEEP |
| `/admin/shipping-audit` | Missing shipping and vendor invoice review | Shipping assignment/upload actions | Operations/Integrations | KEEP |
| `/admin/operations-workbench` | Cross-system exception queue | Operations action APIs | Operations/System Health | KEEP |
| `/admin/sync-conflicts` | Authoritative conflict review | Sync conflict resolution writes | System Health | KEEP |
| `/admin/orphaned-records` | Orphan suggestions, linking and package recovery | Account/contact/document repair; Books package sync | System Health / Products & Data | KEEP |
| `/admin/data-integrations` | Compatibility route to Integrations | None itself | Superseded mixed hub | RETIRE |
| `/admin/books-scripts` | Full sync, costs, payments, dates and tariff tools | PostgreSQL and Zoho Books; highly data-changing | Advanced; formerly prominent integration tile | ADVANCED |
| `/admin/backfill` | Compatibility route to Books Maintenance | None itself | Duplicate legacy URL | RETIRE |
| `/admin/bounded-books-import` | Date-bounded Books import | PostgreSQL/Zoho Books import | Advanced | ADVANCED |
| `/admin/invoice-export-import` | Controlled invoice artifact reconciliation | Portal invoice records | Advanced | ADVANCED |
| `/admin/reconciliation-artifact-registry` | Chunked reconciliation artifact registration | Artifact registry only; Apply unavailable | Advanced/System Health | ADVANCED |
| `/admin/ross-commission-reconciliation` | Narrow historical commission correction | Portal financial records after exact confirmation | One-time repair | ADVANCED |
| `/admin/maintenance/ben-merge` | Special-purpose identity merge | User/account identity data | Purpose is narrow but still auditable | ADVANCED |
| `/admin/invoices` | Legacy invoice administrative surface | Invoice APIs | Purpose overlaps document/reporting routes; no safe retirement proof | KEEP (flagged) |

## Dependency and safety findings

- All Admin routes remain behind the existing `AdminLayout` administrator-role gate; no provider or database call was added to navigation.
- Old `/admin/data-integrations`, `/admin/people-time`, `/admin/backfill`, and `/admin/geofences` URLs remain compatible redirects.
- `books-scripts`, bounded import, invoice export/import, reconciliation registration, Ross reconciliation, and identity merge are isolated under **Advanced**. Their existing server-side authorization and confirmation behavior remains authoritative; the hub adds a visible risk boundary but does not weaken or bypass any gate.
- `campaigns` and `flyer-studio` remain at their original URLs because the account second-screen workspace embeds them directly.
- `image-manager` remains at its original URL because product details link to it by SKU.
- No route or API was deleted. `/admin/invoices` was deliberately left untouched because its exact distinction from broader document views could not be proven safely.

## Business logic explicitly unchanged

Commission/cost calculations, the 50% default commission policy, ownership rules, sales automation behavior, campaign delivery, sync schedules, Zoho Books/CRM/Voice requests, and historical records were not changed by this reorganization.

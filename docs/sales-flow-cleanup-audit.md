# Sales flow cleanup audit

## Implemented in this preview

The three primary selling workspaces previously used different labels and action placement for moving between daily execution, the account/deal pipeline, and lead conversion. The duplicated header links existed only on some pages, so a rep could need the global menu to return.

A shared responsive workspace switcher now appears in all three locations with one vocabulary and order:

1. **Today** — next-best customer and call execution.
2. **Accounts & Deals** — account context and pipeline management.
3. **Leads** — prospect calling and conversion.

This removes two page-specific links and makes every transition one click without changing data fetching, queue position, filters, customer context, or any write path.

## Evidence-based follow-ups (proposed only)

- The `/sales` page still combines five internal modes in one large component. Extracting mode cards and account filters would reduce maintenance duplication, but should follow component-level behavior tests rather than a wholesale rewrite.
- Account calling exists in Next Best Action, the legacy sales-page call-list mode, and modal campaign tools. Their audiences differ today; do not remove one until production usage and outcome logging are compared.
- Repeated metrics across Dashboard, Sales, and Rep Stats should be relabeled from their canonical API contracts before any visual consolidation, so similar-looking figures are not accidentally treated as equivalent.

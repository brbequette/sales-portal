# Financial-rule calculation map (audit baseline)

| Area | Implementation | Inputs / formula | Persistence / consumers | Status |
|---|---|---|---|---|
| Revenue | `netlify/functions/lib/cost-calculations.ts:calculateDocumentCosts` | Zoho line totals; subtotal fallback from lines | Invoice computed fields, processing UI | Matches approved rule |
| Historical cost | `calculateDocumentCosts` | line `purchase_rate`/stored cost before catalog fallback | LineItem and invoice cost snapshots | Matches; fallback is flagged |
| Gross profit | `calculateDocumentCosts` | subtotal − VIG-adjusted dead cost − card fee − additional costs | `computedProfit`, commission consumers | Matches |
| Card fee | `calculateCardProcessingFee` | 4.5% × grand total; cents rounding | `computedCcFees` / Zoho custom field | Corrected from subtotal; subtotal fallback requires review |
| Tariff | `process-invoice-costs.ts` | 12.5% of non-gift dead cost when applicable | Invoice adjustment; excluded from profit commission basis | Review tariff policy edge cases |
| Gifts | `isGiftItem`, `isNoVigItem` | zero price, explicit fields, keyword fallback | VIG buckets and sale ownership | Matches |
| VIG | `resolveVigRate` | rep/date/settings; Monty permanent 1.0 when documented | `computedVigRate` | Matches documented defaults |
| Commission | `calculateDocumentCosts` | positive profit × resolved commission rate; loss split for negatives | `computedUpfront`/`computedFinal`, ledgers | Matches separation requirement |
| Goals / clawback | `src/lib/clawback-calculator.ts` | monthly subtotal/profit goals and next-month VIG cascade | goal and adjustment records | Needs dedicated coverage |
| Credits / returns / write-offs | credit-note, payment, collection handlers | reverse original effects once | ledger and balance consumers | Needs dedicated coverage |
| Payouts | `add-payout.ts`, `update-payout.ts`, `delete-payout.ts` | immutable paid records; unpaid adjustments | `Payout` and commission ledger | Needs dedicated coverage |

Known rule conflict: `PROJECT_CONTEXT.md` contains an older subtotal card-fee statement; the current approved rule is grand total. Missing grand-total data must be surfaced as an incomplete-data review condition, never silently treated as exact.

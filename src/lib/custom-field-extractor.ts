/**
 * Standardized Custom Field Extractor
 * 
 * Provides unified, resilient accessors for Zoho Custom Fields across
 * raw API responses, custom_field_hash objects, custom_fields arrays, and database JSON items.
 */

export interface FieldMapping {
  entity: string;
  apiName: string;
  label: string;
  internalKey: string;
}

// Canonical Field Definitions Catalog
export const CANONICAL_FIELD_CATALOG: Record<string, Record<string, string>> = {
  INVOICE: {
    salespersonVig: 'cf_salesperson_vig',
    profit: 'cf_profit',
    commissionAmount: 'cf_commision_amount', // Zoho Invoice API typo
    deadCostTotal: 'cf_dead_cost_total',
    deadCostSubjectToVig: 'cf_dead_cost_subject_to_vig',
    deadCostNoVig: 'cf_dead_cost_no_vig',
    deadCostPlusVig: 'cf_dead_cost_with_vig',
    ccFees: 'cf_credit_card_processing_fees',
    ccBreakdown: 'cf_cc_charge_s_breakdown',
    additionalCosts: 'cf_additional_costs_to_order',
    additionalCostNotes: 'cf_additional_cost_explanation',
    insurance: 'cf_insurance',
    purchaseOrderNumbers: 'cf_purchase_order_number_s',
    estimateNumber: 'cf_estimate_number',
    estimateDate: 'cf_estimate_date',
    paidInFullDate: 'cf_paid_in_full_date',
    commissionStatus: 'cf_commission_status',
    writtenOff: 'cf_written_off',
    removeTariffSurcharge: 'cf_remove_tariff_surcharge',
    itemsDcBreakdown: 'cf_dc_breakdown',
    reference: 'cf_reference'
  },
  SALESORDER: {
    salespersonVig: 'cf_salesperson_vig',
    profit: 'cf_estimated_profit',
    commissionAmount: 'cf_commission_amount',
    deadCostTotal: 'cf_dead_cost_total',
    deadCostSubjectToVig: 'cf_dead_cost_subject_to_vig',
    deadCostNoVig: 'cf_dead_cost_no_vig',
    deadCostPlusVig: 'cf_total_dead_cost_with_vig',
    itemsDcBreakdown: 'cf_items_dc_breakdown',
    removeTariffSurcharge: 'cf_remove_tariff_surcharge'
  },
  ITEM: {
    subjectToVig: 'cf_subject_to_sales_markup',
    giftItem: 'cf_gift_item',
    promoItem: 'cf_event_promo_item',
    salesmanCostMultiplier: 'cf_salesman_cost_multiplier'
  }
};

import exemptCatalog from "./exempt-catalog.json";

/**
 * Check if a line item is exempt from VIG (No VIG) based on cf_subject_to_sales_markup,
 * gift status, zero rate, catalog exemption, or explicit noVig flags.
 */
export function isItemExemptFromVig(item: any): boolean {
  if (!item || typeof item !== 'object') return false;

  // 1. Direct explicit boolean / string flag checks
  if (item.noVig === true || item.no_vig === true || item.isNoVig === true || item.is_no_vig === true) return true;
  if (item.noVig === 'true' || item.no_vig === 'true' || item.isNoVig === 'true') return true;
  if (item.subjectToVig === false || item.subject_to_vig === false || item.subjectToSalesMarkup === false) return true;

  // 2. Inspect cf_subject_to_sales_markup and variants (if false/0/No -> Exempt)
  const markupKeys = [
    'cf_subject_to_sales_markup',
    'cf_subject_to_sales_markup_unformatted',
    'subject_to_sales_markup',
    'subjectToSalesMarkup',
    'subject_to_vig',
    'subjectToVig',
    'cf_subject_to_vig',
    'cf_subject_to_vig_unformatted'
  ];

  for (const k of markupKeys) {
    if (item[k] !== undefined && item[k] !== null) {
      const val = String(item[k]).toLowerCase().trim();
      if (val === 'false' || val === 'no' || val === '0' || val === 'exempt') return true;
      if (val === 'true' || val === 'yes' || val === '1') return false;
    }
  }

  // 3. Custom fields array inspection
  const cfs = item.item_custom_fields || item.custom_fields || [];
  if (Array.isArray(cfs)) {
    const field = cfs.find((c: any) => {
      if (!c) return false;
      const name = (c.api_name || c.label || c.placeholder || '').toLowerCase();
      return name.includes('subject_to_sales_markup') || name.includes('sales_markup') || name.includes('subject_to_vig') || name.includes('vig_exempt');
    });
    if (field) {
      const val = String(field.value || '').toLowerCase().trim();
      if (val === 'false' || val === 'no' || val === '0' || val === 'exempt') return true;
      if (val === 'true' || val === 'yes' || val === '1') return false;
    }
  }

  // 4. Catalog SKUs / Item Names exempt from sales markup
  const sku = (item.sku || item.code || "").toUpperCase().trim();
  const name = (item.name || "").toUpperCase().trim();
  if (
    exemptCatalog.exemptSkus.some((s: string) => sku === s || name === s) ||
    exemptCatalog.exemptPrefixes.some((p: string) => (sku && sku.startsWith(p)) || (name && name.startsWith(p)))
  ) {
    return true;
  }

  // 5. Gift / Zero-Rate / Promo Item Keyword fallback
  const description = (item.description || "").toLowerCase();
  const giftKeywords = [
    "gift", "hat", "trucker", "shirt", "t-shirt", "tee", "hoodie", "jacket",
    "apparel", "swag", "promo", "cup", "mug", "beaver", "sample",
    "card", "giftcard", "merch", "pant", "beanie", "glove", "pen",
    "banner", "flyer", "sticker", "decal", "display", "polo", "vest",
    "sweatshirt", "cap", "bag", "blade bag", "coat", "umbrella", "tumbler",
    "bottle", "keychain"
  ];
  if (giftKeywords.some(k => name.toLowerCase().includes(k) || description.includes(k)) || parseFloat(item.rate || 0) === 0) {
    return true;
  }

  return false;
}


/**
 * Extract a field value safely from any Zoho record or items JSON
 */
export function extractCustomFieldValue(
  record: any,
  fieldKey: string,
  defaultValue: any = null
): any {
  if (!record || typeof record !== 'object') return defaultValue;

  // 1. Direct key match on normalized object/JSON
  if (record[fieldKey] !== undefined && record[fieldKey] !== null) {
    return record[fieldKey];
  }

  // 2. Try custom_field_hash (Zoho Detail API)
  const cfh = record.custom_field_hash || record;
  if (cfh && typeof cfh === 'object') {
    // Try unformatted numeric variant first
    const unformattedKey = `${fieldKey}_unformatted`;
    if (cfh[unformattedKey] !== undefined && cfh[unformattedKey] !== null) {
      return cfh[unformattedKey];
    }
    const cfKey = fieldKey.startsWith('cf_') ? fieldKey : `cf_${fieldKey}`;
    const cfUnformattedKey = `${cfKey}_unformatted`;
    if (cfh[cfUnformattedKey] !== undefined && cfh[cfUnformattedKey] !== null) {
      return cfh[cfUnformattedKey];
    }
    if (cfh[cfKey] !== undefined && cfh[cfKey] !== null) {
      return cfh[cfKey];
    }
    if (cfh[fieldKey] !== undefined && cfh[fieldKey] !== null) {
      return cfh[fieldKey];
    }
  }

  // 3. Try custom_fields array (Zoho List API)
  const cfs = record.custom_fields || record.item_custom_fields || [];
  if (Array.isArray(cfs)) {
    const cfMatch = cfs.find((f: any) => {
      if (!f) return false;
      const api = (f.api_name || f.placeholder || '').toLowerCase();
      const label = (f.label || '').toLowerCase();
      const target = fieldKey.toLowerCase();
      return api === target || api === `cf_${target}` || label === target;
    });
    if (cfMatch && cfMatch.value !== undefined && cfMatch.value !== null) {
      return cfMatch.value;
    }
  }

  return defaultValue;
}

/**
 * Standardized Accessors for Core Sales Metrics
 */
export function extractVigRate(docOrItems: any): number {
  const val = extractCustomFieldValue(docOrItems, 'cf_salesperson_vig', null) 
    ?? extractCustomFieldValue(docOrItems, 'vig', null)
    ?? extractCustomFieldValue(docOrItems, 'salespersonVig', null);
  const parsed = parseFloat(val);
  return !isNaN(parsed) && parsed > 0 ? parsed : 1.3;
}

export function extractProfit(docOrItems: any): number {
  const val = extractCustomFieldValue(docOrItems, 'cf_estimated_profit', null)
    ?? extractCustomFieldValue(docOrItems, 'cf_profit', null)
    ?? extractCustomFieldValue(docOrItems, 'profit', null);
  const parsed = parseFloat(val);
  return !isNaN(parsed) ? parsed : 0.0;
}

export function extractCommissionAmount(docOrItems: any): number {
  const val = extractCustomFieldValue(docOrItems, 'cf_commission_amount', null)
    ?? extractCustomFieldValue(docOrItems, 'cf_commision_amount', null)
    ?? extractCustomFieldValue(docOrItems, 'commission', null);
  const parsed = parseFloat(val);
  return !isNaN(parsed) ? parsed : 0.0;
}

export function extractDeadCostTotal(docOrItems: any): number {
  const val = extractCustomFieldValue(docOrItems, 'cf_dead_cost_total', null)
    ?? extractCustomFieldValue(docOrItems, 'deadCostTotal', null)
    ?? extractCustomFieldValue(docOrItems, 'dead_cost_total', null)
    ?? extractCustomFieldValue(docOrItems, 'deadCost', null);
  const parsed = parseFloat(val);
  return !isNaN(parsed) ? parsed : 0.0;
}

export function extractCcFees(docOrItems: any): number {
  const val = extractCustomFieldValue(docOrItems, 'cf_credit_card_processing_fees', null)
    ?? extractCustomFieldValue(docOrItems, 'ccFees', null)
    ?? extractCustomFieldValue(docOrItems, 'cc_fees', null);
  const parsed = parseFloat(val);
  return !isNaN(parsed) ? parsed : 0.0;
}

export function extractAdditionalCosts(docOrItems: any): number {
  const val = extractCustomFieldValue(docOrItems, 'cf_additional_costs_to_order', null)
    ?? extractCustomFieldValue(docOrItems, 'additionalCosts', null)
    ?? extractCustomFieldValue(docOrItems, 'additional_costs', null);
  const parsed = parseFloat(val);
  return !isNaN(parsed) ? parsed : 0.0;
}

export function extractInsurance(docOrItems: any): number {
  const val = extractCustomFieldValue(docOrItems, 'cf_insurance', null)
    ?? extractCustomFieldValue(docOrItems, 'insurance', null);
  const parsed = parseFloat(val);
  return !isNaN(parsed) ? parsed : 0.0;
}

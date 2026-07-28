const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

// Path to cached metadata
const ALL_FIELDS_FILE = path.join(__dirname, '../../all_module_fields.json');

// Standard internal key mappings for core known custom fields
const INTERNAL_KEY_MAP = {
  // Invoices & Sales Orders
  'cf_salesperson_vig': 'salespersonVig',
  'cf_profit': 'profit',
  'cf_estimated_profit': 'profit',
  'cf_commision_amount': 'commissionAmount',
  'cf_commission_amount': 'commissionAmount',
  'cf_dead_cost_total': 'deadCostTotal',
  'cf_dead_cost_subject_to_vig': 'deadCostSubjectToVig',
  'cf_dead_cost_no_vig': 'deadCostNoVig',
  'cf_dead_cost_with_vig': 'deadCostPlusVig',
  'cf_total_dead_cost_with_vig': 'deadCostPlusVig',
  'cf_credit_card_processing_fees': 'ccFees',
  'cf_cc_charge_s_breakdown': 'ccBreakdown',
  'cf_additional_costs_to_order': 'additionalCosts',
  'cf_additional_cost_explanation': 'additionalCostNotes',
  'cf_insurance': 'insurance',
  'cf_purchase_order_number_s': 'purchaseOrderNumbers',
  'cf_estimate_number': 'estimateNumber',
  'cf_estimate_date': 'estimateDate',
  'cf_paid_in_full_date': 'paidInFullDate',
  'cf_commission_status': 'commissionStatus',
  'cf_written_off': 'writtenOff',
  'cf_remove_tariff_surcharge': 'removeTariffSurcharge',
  'cf_dc_breakdown': 'itemsDcBreakdown',
  'cf_items_dc_breakdown': 'itemsDcBreakdown',
  'cf_reference': 'reference',

  // Items
  'cf_subject_to_sales_markup': 'subjectToVig',
  'cf_gift_item': 'giftItem',
  'cf_salesman_cost_multiplier': 'salesmanCostMultiplier',

  // Deals / CRM
  'Invoice_Number': 'invoiceNumber',
  'PO_Number': 'poNumber',
  'Estimate_Number': 'estimateNumber'
};

async function seedCustomFields() {
  console.log('Reading custom field definitions...');
  let rawData = {};
  if (fs.existsSync(ALL_FIELDS_FILE)) {
    rawData = JSON.parse(fs.readFileSync(ALL_FIELDS_FILE, 'utf8'));
  }

  const client = new Client({ connectionString });
  await client.connect();

  console.log('Seeding custom fields into database...');

  const entries = [];

  // 1. Process Zoho Books Modules (Estimates, SalesOrders, Invoices)
  const moduleEntityMap = {
    'estimates': 'ESTIMATE',
    'salesorders': 'SALESORDER',
    'invoices': 'INVOICE'
  };

  for (const [mod, entity] of Object.entries(moduleEntityMap)) {
    const modData = rawData[mod] || {};
    const cfs = modData.customfields || {};
    for (const [subKey, fieldList] of Object.entries(cfs)) {
      if (Array.isArray(fieldList)) {
        for (const f of fieldList) {
          const apiName = f.api_name || f.placeholder || '';
          const label = f.label || '';
          if (!apiName && !label) continue;
          
          const cid = f.customfield_id || f.field_id || null;
          const dataType = f.data_type || 'string';
          const internalKey = INTERNAL_KEY_MAP[apiName] || apiName.replace(/^cf_/, '').replace(/_([a-z])/g, (_, g) => g.toUpperCase());

          entries.push({
            id: `${entity}_${apiName || cid}`,
            entity,
            label,
            apiName,
            customfieldId: cid ? String(cid) : null,
            internalKey,
            dataType,
            description: f.help_text || `Zoho ${entity} custom field '${label}'`
          });
        }
      }
    }
  }

  // 2. Add Item Custom Fields
  const itemFields = [
    { label: 'SUBJECT TO SALES MARKUP', apiName: 'cf_subject_to_sales_markup', cid: '1254360000027505036', internalKey: 'subjectToVig', dataType: 'check_box' },
    { label: 'GIFT ITEM', apiName: 'cf_gift_item', cid: '1254360000029202080', internalKey: 'giftItem', dataType: 'check_box' },
    { label: 'Event Promo Item', apiName: 'cf_event_promo_item', cid: '1254360000040424289', internalKey: 'promoItem', dataType: 'check_box' },
    { label: 'Salesman Cost Multiplier', apiName: 'cf_salesman_cost_multiplier', cid: '1254360000027505022', internalKey: 'salesmanCostMultiplier', dataType: 'amount' }
  ];

  for (const f of itemFields) {
    entries.push({
      id: `ITEM_${f.apiName}`,
      entity: 'ITEM',
      label: f.label,
      apiName: f.apiName,
      customfieldId: f.cid,
      internalKey: f.internalKey,
      dataType: f.dataType,
      description: `Item catalog custom field '${f.label}'`
    });
  }

  // 3. Add Account / Deal Custom Fields
  const accountFields = [
    { label: 'Sales Representative', apiName: 'cf_sales_person_1', cid: '1254360000007732187', internalKey: 'salesPerson', dataType: 'string' },
    { label: 'Customer PO Number', apiName: 'cf_customer_po', cid: '1254360000008095896', internalKey: 'customerPo', dataType: 'string' },
    { label: 'WOC 2026 Customer', apiName: 'cf_woc_2026_customer', cid: '1254360000038538623', internalKey: 'woc2026Customer', dataType: 'check_box' }
  ];

  for (const f of accountFields) {
    entries.push({
      id: `ACCOUNT_${f.apiName}`,
      entity: 'ACCOUNT',
      label: f.label,
      apiName: f.apiName,
      customfieldId: f.cid,
      internalKey: f.internalKey,
      dataType: f.dataType,
      description: `Account entity field '${f.label}'`
    });
  }

  // Upsert into database
  let inserted = 0;
  for (const e of entries) {
    await client.query(`
      INSERT INTO "CustomFieldMapping" ("id", "entity", "label", "apiName", "customfieldId", "internalKey", "dataType", "isActive", "description", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW())
      ON CONFLICT ("entity", "apiName") DO UPDATE
      SET "label" = EXCLUDED."label",
          "customfieldId" = EXCLUDED."customfieldId",
          "internalKey" = EXCLUDED."internalKey",
          "dataType" = EXCLUDED."dataType",
          "description" = EXCLUDED."description",
          "updatedAt" = NOW();
    `, [e.id, e.entity, e.label, e.apiName, e.customfieldId, e.internalKey, e.dataType, e.description]);
    inserted++;
  }

  console.log(`Successfully cataloged ${inserted} custom fields into database!`);
  await client.end();
}

seedCustomFields().catch(console.error);

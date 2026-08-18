# Scripts Directory

This directory contains various scripts for database management, data exports, fixing corrupted data, and miscellaneous utilities.

## Active / Production Scripts
- `create_database.bat` - Creates the database environment.
- `expose_zoho.bat` - Scripts for exposing Zoho endpoints locally.
- `run.bat` - Starts the dev server / production.
- `run_deploy.bat` - Deployment script.
- `check_db.mjs` - Verifies database integrity.
- `fetch_db.js` - Fetches database tables/records.

## One-time / Migration Scripts
- `backfill-invoice-profit.js` - Backfills missing profit data for old invoices.
- `backfill_numbers.js` - Fixes number types in records.
- `backfill_po_invoice_links.js` - Re-links Purchase Orders to Invoices.
- `patch.py` - Patched data model or specific fields.
- `refactor_collections.py` - Remodels collections format.
- `rename.js` - Renames specific fields in collections.
- `update-get-accounts.js` - Updates old accounts logic.
- `update-modal-addr.js` - Updates modal address data.

## Debug / Test Scripts
- `check.js` - Test connectivity/schema.
- `check_build_log.js` - Verifies Vercel/Netlify build logs.
- `check_deploy.js` - Checks deployment status.
- `check_links.js` - Verifies specific links.
- `find_mojibake.py`, `decode_mojibake.py` - Helps debug and find character encoding issues.
- `print_db.js`, `print-crm-invoices.js`, `print-zoho-invoice.js` - Fetches and prints out specific records for debugging.
- `scratch_check_db.js`, `scratch_check_invoices.js`, `scratch_check_product.ts`, `scratch_test_db_url.js` - Temporary test scripts.
- `test-zoho-2.mjs`, `test-zoho.ts`, `test_double_encode.py`, `write_test_db.py` - General API and formatting tests.

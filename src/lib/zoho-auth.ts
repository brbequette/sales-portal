/**
 * zoho-auth.ts — Re-export wrapper
 *
 * The canonical implementation lives in:
 *   netlify/functions/lib/zoho-auth.ts
 *
 * This file exists so that src/ modules (sync-engine, etc.) can import
 * with the @/lib/zoho-auth path alias without duplicating any logic.
 */
export {
  getZohoAccessToken,
  pushZohoNote,
  ZOHO_DC,
  ZOHO_ORGANIZATION_ID,
} from '../../netlify/functions/lib/zoho-auth';

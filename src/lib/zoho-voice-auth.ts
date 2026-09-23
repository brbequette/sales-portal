/**
 * Re-export the canonical Zoho Voice OAuth implementation for Next.js routes.
 * Voice credentials are intentionally isolated from Books/CRM/Mail credentials.
 */
export { getZohoVoiceAccessToken } from '../../netlify/functions/lib/zoho-voice-auth';

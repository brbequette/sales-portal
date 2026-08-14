import { getZohoAccessToken, ZOHO_DC } from "./zoho-auth"

const MAIL_BASE_URL = `https://mail.zoho.${ZOHO_DC}/api`

export async function fetchMailAccounts() {
  const token = await getZohoAccessToken()
  const res = await fetch(`${MAIL_BASE_URL}/accounts`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
  })
  if (!res.ok) throw new Error(`Zoho Mail accounts fetch failed: ${await res.text()}`)
  return res.json()
}

export async function fetchFolders(accountId: string) {
  const token = await getZohoAccessToken()
  const res = await fetch(`${MAIL_BASE_URL}/accounts/${accountId}/folders`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
  })
  if (!res.ok) throw new Error(`Zoho Mail folders fetch failed: ${await res.text()}`)
  return res.json()
}

export async function fetchEmails(accountId: string, folderId: string, limit: number = 20, start: number = 0) {
  const token = await getZohoAccessToken()
  const res = await fetch(`${MAIL_BASE_URL}/accounts/${accountId}/messages/view?folderId=${folderId}&limit=${limit}&start=${start}`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
  })
  if (!res.ok) throw new Error(`Zoho Mail emails fetch failed: ${await res.text()}`)
  return res.json()
}

export async function fetchEmailContent(accountId: string, messageId: string) {
  const token = await getZohoAccessToken()
  const res = await fetch(`${MAIL_BASE_URL}/accounts/${accountId}/messages/${messageId}/content`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
  })
  if (!res.ok) throw new Error(`Zoho Mail content fetch failed: ${await res.text()}`)
  return res.json()
}

export async function sendEmail(accountId: string, payload: { fromAddress: string, toAddress: string, ccAddress?: string, subject: string, content: string }) {
  const token = await getZohoAccessToken()
  const reqBody: any = {
    fromAddress: payload.fromAddress,
    toAddress: payload.toAddress,
    subject: payload.subject,
    content: payload.content,
    askReceipt: 'no'
  }
  if (payload.ccAddress) {
    reqBody.ccAddress = payload.ccAddress
  }

  const res = await fetch(`${MAIL_BASE_URL}/accounts/${accountId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqBody)
  })
  if (!res.ok) throw new Error(`Zoho Mail send failed: ${await res.text()}`)
  return res.json()
}

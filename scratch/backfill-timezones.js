const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const legacyEnvPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(legacyEnvPath)) {
  const env = fs.readFileSync(legacyEnvPath, 'utf8');
  env.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
      process.env[key] = val;
    }
  });
}

const ZOHO_DC = process.env.ZOHO_DC || 'com';

const areaCodeToState = {
  // Pacific
  '206': 'WA', '253': 'WA', '360': 'WA', '425': 'WA', '509': 'WA',
  '503': 'OR', '971': 'OR', '541': 'OR',
  '209': 'CA', '213': 'CA', '310': 'CA', '323': 'CA', '408': 'CA', '415': 'CA', '510': 'CA', '530': 'CA', '559': 'CA', '562': 'CA', '619': 'CA', '626': 'CA', '650': 'CA', '661': 'CA', '707': 'CA', '714': 'CA', '760': 'CA', '805': 'CA', '818': 'CA', '831': 'CA', '858': 'CA', '909': 'CA', '916': 'CA', '925': 'CA', '949': 'CA', '951': 'CA',
  '702': 'NV', '775': 'NV',
  // Mountain
  '801': 'UT', '385': 'UT', '435': 'UT',
  '602': 'AZ', '480': 'AZ', '623': 'AZ', '520': 'AZ', '928': 'AZ',
  '303': 'CO', '720': 'CO', '719': 'CO', '970': 'CO',
  '208': 'ID', '986': 'ID',
  '406': 'MT',
  '505': 'NM', '575': 'NM',
  '307': 'WY',
  // Central
  '214': 'TX', '254': 'TX', '281': 'TX', '325': 'TX', '361': 'TX', '409': 'TX', '469': 'TX', '512': 'TX', '713': 'TX', '806': 'TX', '817': 'TX', '830': 'TX', '832': 'TX', '903': 'TX', '915': 'TX', '936': 'TX', '940': 'TX', '956': 'TX', '972': 'TX', '979': 'TX',
  '312': 'IL', '773': 'IL', '847': 'IL', '630': 'IL', '708': 'IL', '815': 'IL', '309': 'IL', '618': 'IL', '217': 'IL',
  '219': 'IN', '574': 'IN', '260': 'IN', '317': 'IN', '765': 'IN', '812': 'IN',
  '313': 'MI', '810': 'MI', '248': 'MI', '586': 'MI', '734': 'MI', '616': 'MI', '517': 'MI', '989': 'MI', '231': 'MI', '906': 'MI',
  '414': 'WI', '262': 'WI', '608': 'WI', '920': 'WI', '715': 'WI',
  '612': 'MN', '651': 'MN', '952': 'MN', '763': 'MN', '218': 'MN', '507': 'MN', '320': 'MN',
  '314': 'MO', '636': 'MO', '816': 'MO', '417': 'MO', '573': 'MO', '660': 'MO',
  '402': 'NE', '308': 'NE',
  '701': 'ND',
  '605': 'SD',
  '405': 'OK', '918': 'OK', '580': 'OK',
  '316': 'KS', '785': 'KS', '620': 'KS',
  // Eastern
  '207': 'ME',
  '603': 'NH',
  '802': 'VT',
  '617': 'MA', '508': 'MA', '781': 'MA', '978': 'MA', '413': 'MA',
  '401': 'RI',
  '203': 'CT', '860': 'CT',
  '212': 'NY', '718': 'NY', '917': 'NY', '516': 'NY', '631': 'NY', '914': 'NY', '845': 'NY', '518': 'NY', '315': 'NY', '585': 'NY', '716': 'NY', '607': 'NY',
  '201': 'NJ', '973': 'NJ', '908': 'NJ', '732': 'NJ', '609': 'NJ', '856': 'NJ',
  '215': 'PA', '610': 'PA', '570': 'PA', '717': 'PA', '814': 'PA', '412': 'PA', '724': 'PA',
  '216': 'OH', '440': 'OH', '330': 'OH', '419': 'OH', '614': 'OH', '740': 'OH', '513': 'OH', '937': 'OH',
  '302': 'DE',
  '410': 'MD', '301': 'MD',
  '202': 'DC',
  '804': 'VA', '757': 'VA', '703': 'VA', '540': 'VA', '276': 'VA',
  '304': 'WV',
  '704': 'NC', '919': 'NC', '336': 'NC', '252': 'NC', '828': 'NC', '910': 'NC',
  '803': 'SC', '843': 'SC', '864': 'SC',
  '404': 'GA', '770': 'GA', '706': 'GA', '912': 'GA', '478': 'GA', '229': 'GA',
  '904': 'FL', '352': 'FL', '407': 'FL', '813': 'FL', '727': 'FL', '941': 'FL', '239': 'FL', '561': 'FL', '954': 'FL', '305': 'FL', '786': 'FL', '850': 'FL',
  '502': 'KY', '859': 'KY', '270': 'KY', '606': 'KY',
  '615': 'TN', '865': 'TN', '901': 'TN', '423': 'TN', '931': 'TN',
  '205': 'AL', '256': 'AL', '334': 'AL', '251': 'AL',
  '601': 'MS', '228': 'MS', '662': 'MS',
  '504': 'LA', '225': 'LA', '318': 'LA', '337': 'LA', '985': 'LA',
  '501': 'AR', '479': 'AR', '870': 'AR'
};

function getTimezoneByState(state) {
  if (!state) return null;
  const s = state.toUpperCase().trim();
  
  const eastern = ['CT', 'DE', 'FL', 'GA', 'IN', 'KY', 'ME', 'MD', 'MA', 'MI', 'NH', 'NJ', 'NY', 'NC', 'OH', 'PA', 'RI', 'SC', 'TN', 'VT', 'VA', 'WV', 'DC'];
  const central = ['AL', 'AR', 'IL', 'IA', 'KS', 'LA', 'MN', 'MS', 'MO', 'NE', 'ND', 'OK', 'SD', 'TX', 'WI'];
  const mountain = ['AZ', 'CO', 'ID', 'MT', 'NM', 'UT', 'WY'];
  const pacific = ['CA', 'NV', 'OR', 'WA'];
  const alaska = ['AK'];
  const hawaii = ['HI'];

  if (eastern.includes(s)) return 'EST';
  if (central.includes(s)) return 'CST';
  if (mountain.includes(s)) return 'MST';
  if (pacific.includes(s)) return 'PST';
  if (alaska.includes(s)) return 'AST';
  if (hawaii.includes(s)) return 'HST';
  
  return null;
}

function getTimezoneByPhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return null;
  
  let areaCode = '';
  if (cleaned.length === 10) {
    areaCode = cleaned.substring(0, 3);
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    areaCode = cleaned.substring(1, 4);
  } else {
    areaCode = cleaned.substring(0, 3);
  }
  
  const state = areaCodeToState[areaCode];
  return getTimezoneByState(state);
}

async function getAccessToken() {
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    try {
      const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      });
      const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json();
      return data.access_token;
    } catch (e) {
      console.warn(e);
    }
  }
  return process.env.ZOHO_ACCESS_TOKEN;
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log("Token acquired.");
    
    const dbAccounts = await prisma.account.findMany({
      select: { id: true, zohoId: true, name: true, timeZone: true }
    });
    console.log(`Loaded ${dbAccounts.length} accounts from local database.`);
    
    let page = 1;
    let hasMore = true;
    const crmAccountsMap = new Map();
    
    while (hasMore) {
      console.log(`Fetching page ${page} of Accounts from Zoho CRM...`);
      const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?fields=id,Billing_State,Phone&per_page=200&page=${page}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const data = await res.json();
      
      if (data.code || !data.data || data.data.length === 0) {
        console.log("No more accounts or error:", data);
        break;
      }
      
      data.data.forEach(acc => {
        crmAccountsMap.set(acc.id, acc);
      });
      
      hasMore = data.info?.more_records || false;
      page++;
    }
    
    console.log(`Loaded ${crmAccountsMap.size} accounts from Zoho CRM.`);
    
    const updateOps = [];
    let updatedCount = 0;
    
    for (const dbAcc of dbAccounts) {
      const crmAcc = crmAccountsMap.get(dbAcc.zohoId);
      let calculatedTz = null;
      
      if (crmAcc) {
        calculatedTz = getTimezoneByState(crmAcc.Billing_State) || getTimezoneByPhone(crmAcc.Phone);
      }
      
      if (!calculatedTz) {
        const primaryContact = await prisma.contact.findFirst({
          where: { accountId: dbAcc.id, isPrimary: true },
          select: { phone: true, mobilePhone: true }
        });
        if (primaryContact) {
          calculatedTz = getTimezoneByPhone(primaryContact.phone) || getTimezoneByPhone(primaryContact.mobilePhone);
        }
      }
      
      if (!calculatedTz) {
        calculatedTz = 'MST';
      }
      
      if (dbAcc.timeZone !== calculatedTz) {
        updateOps.push(
          prisma.account.update({
            where: { id: dbAcc.id },
            data: { timeZone: calculatedTz }
          })
        );
        updatedCount++;
      }
    }
    
    if (updateOps.length > 0) {
      for (let i = 0; i < updateOps.length; i += 50) {
        const chunk = updateOps.slice(i, i + 50);
        await prisma.$transaction(chunk);
      }
      console.log(`Successfully updated time zones to standard abbreviation for ${updatedCount} accounts.`);
    } else {
      console.log("All accounts already have correct time zones.");
    }
    
  } catch (error) {
    console.error("Error running timezone backfill:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

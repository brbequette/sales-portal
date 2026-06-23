require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } });
  const token = tokenSetting ? tokenSetting.value : null;
  if (!token) return console.error("No token");

  const zohoVoiceUrl = `https://voice.zoho.com/rest/json/v2/sms/send`;
  const smsData = {
    customerNumber: '14809990105', 
    message: 'Test message',
    senderId: '14804702577',
    mms: false
  };

  const FormData = require('form-data');
  const formData = new FormData();
  formData.append('sms_data', JSON.stringify(smsData));

  const res = await fetch(zohoVoiceUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}

main().finally(() => prisma.$disconnect());

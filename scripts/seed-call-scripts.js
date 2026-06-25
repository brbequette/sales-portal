const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const inputFile = "C:\\Users\\titan\\.gemini\\antigravity\\brain\\adc62dd9-9b53-4230-b596-36aeb9369555\\scratch\\docx_parser\\all_scripts_extracted.txt";

async function main() {
  const content = fs.readFileSync(inputFile, 'utf-8');
  const sections = content.split('=== SCRIPT FILE:');
  
  // Clear existing
  await prisma.callScript.deleteMany({});
  console.log("Cleared existing scripts.");

  let count = 0;
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const lines = section.trim().split('\n');
    const fileName = lines[0].replace('===', '').trim();
    const scriptContent = lines.slice(1).join('\n').trim();

    if (fileName && scriptContent) {
      let callType = "General";
      if (fileName.toLowerCase().includes("fact")) callType = "Intro";
      if (fileName.toLowerCase().includes("pitch")) callType = "Product Pitch";
      if (fileName.toLowerCase().includes("objection")) callType = "Objection Handling";

      await prisma.callScript.create({
        data: {
          name: fileName.replace('.docx', '').replace('.doc', ''),
          callType: callType,
          content: scriptContent,
          isActive: true
        }
      });
      count++;
    }
  }

  console.log(`Seeded ${count} scripts from the Scripts folder into the database.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

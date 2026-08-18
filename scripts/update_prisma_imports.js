const fs = require('fs');
const path = require('path');

const dir = path.join(process.cwd(), 'netlify', 'functions');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

console.log(`Scanning ${files.length} Netlify function files...`);
let updated = 0;

files.forEach(f => {
  const filePath = path.join(dir, f);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('new PrismaClient()')) {
    // Remove PrismaClient import if present
    content = content.replace(/import\s*\{\s*PrismaClient\s*\}\s*from\s*["']@prisma\/client["'];?\r?\n?/g, '');
    
    // Replace const prisma = new PrismaClient() with import { prisma } from "./lib/prisma"
    content = content.replace(/const\s+prisma\s*=\s*new\s+PrismaClient\(\);?/g, 'import { prisma } from "./lib/prisma"');

    // Make sure import is at top level
    if (!content.includes('import { prisma } from "./lib/prisma"')) {
      content = 'import { prisma } from "./lib/prisma"\n' + content;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    updated++;
  }
});

console.log(`Updated ${updated} Netlify function files to use shared Prisma singleton with dbUrl fallback!`);

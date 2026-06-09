const fs = require('fs');
const path = require('path');

// Manually load .env variables
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        if (key && val) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.error("Failed to load .env file:", e);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Database URL:", process.env.DATABASE_URL ? "Loaded successfully" : "Missing");
    console.log("Deleting existing products...");
    await prisma.product.deleteMany({});

    console.log("Seeding products with JSON descriptions...");
    const demoProducts = [
      {
        sku: "TD-BL-100",
        name: "Premium Turbo Blade 4.5\"",
        description: JSON.stringify({
          text: "Fast cutting for granite & concrete.",
          cost: 18.50,
          vendor: "Star Diamond Tools",
          retail: 45.00,
          pertinentInfo: "Diameter: 4.5 inches. Max RPM: 13,300. Arbor: 7/8\"-5/8\". Segment Height: 10mm. Use wet or dry."
        }),
        price: 45.00,
        category: "Blades",
        stock: 100
      },
      {
        sku: "TD-BL-102",
        name: "Continuous Rim Blade 7\"",
        description: JSON.stringify({
          text: "Smooth cuts on tile and porcelain.",
          cost: 28.00,
          vendor: "Precision Cuts Inc.",
          retail: 65.00,
          pertinentInfo: "Diameter: 7 inches. Max RPM: 8,600. Arbor: 5/8\". Segment Width: 1.6mm. Best used wet to prevent chipping."
        }),
        price: 65.00,
        category: "Blades",
        stock: 85
      },
      {
        sku: "TD-PP-200",
        name: "Wet Polishing Pad Set (50-3000 grit)",
        description: JSON.stringify({
          text: "Complete set of 4\" wet pads.",
          cost: 48.00,
          vendor: "ShinePro Abrasives",
          retail: 120.00,
          pertinentInfo: "Set contains 7 pads: 50, 100, 200, 400, 800, 1500, 3000 grit. Backing: Hook & Loop. RPM limit: 4,000. Use wet only."
        }),
        price: 120.00,
        category: "Polishing",
        stock: 50
      },
      {
        sku: "TD-CB-300",
        name: "Dry Core Bit 1-3/8\"",
        description: JSON.stringify({
          text: "Laser welded dry core bit.",
          cost: 35.00,
          vendor: "Apex Drilling Corp",
          retail: 85.00,
          pertinentInfo: "Diameter: 1-3/8 inches. Thread: 5/8\"-11. Barrel Length: 4 inches. Laser-welded segments for long life. Use dry or wet on granite."
        }),
        price: 85.00,
        category: "Core Bits",
        stock: 30
      },
      {
        sku: "TD-CW-400",
        name: "Cup Wheel Double Row 4\"",
        description: JSON.stringify({
          text: "Heavy duty grinding cup wheel.",
          cost: 22.00,
          vendor: "Vulcan Grinding",
          retail: 55.00,
          pertinentInfo: "Diameter: 4 inches. Thread: 5/8\"-11. Double row segments for rapid material removal. Max RPM: 15,000. Dry use."
        }),
        price: 55.00,
        category: "Grinding",
        stock: 120
      }
    ];

    await prisma.product.createMany({
      data: demoProducts
    });

    const products = await prisma.product.findMany({});
    console.log(`Successfully seeded ${products.length} products!`);
  } catch (error) {
    console.error("Reseed Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

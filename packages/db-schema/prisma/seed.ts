import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Clean CSV Parser
function parseCSV(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const results: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length !== headers.length) continue;
    const obj: any = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j];
    }
    results.push(obj);
  }
  return results;
}

async function main() {
  console.log('🌱 Starting dynamic CSV database seeding...');

  // 1. Clean existing database
  console.log('🧹 Cleaning existing tables...');
  await prisma.partnerOverride.deleteMany({});
  await prisma.productCatalog.deleteMany({});
  await prisma.emissionFactor.deleteMany({});
  await prisma.transportFactor.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.partnerKey.deleteMany({});
  await prisma.partner.deleteMany({});

  // 2. Seeding Partner
  console.log('👥 Seeding partner and credentials...');
  const partner = await prisma.partner.create({
    data: {
      partnerId: 'a0f7c222-38b8-4d57-814d-61c02b11ea99',
      companyName: 'Green E-Shop',
      industryVertical: 'ecommerce',
      tier: 'standard',
    },
  });

  await prisma.partnerKey.create({
    data: {
      partnerId: partner.partnerId,
      keyPreview: 'cc_live_te...',
      hashedKey: '76202476d05f31df0d9f00d238b975877c8eec9b1e19d7b42fbb1c1074e4c278', // SHA-256 of cc_live_testkey123
      status: 'active',
    },
  });

  // 3. Seeding Categories from CSV Maps
  console.log('🗂️ Parsing categories from CSV...');
  
  const agribalysePath = path.resolve(__dirname, '../../../../data/agribalyse_categories.csv');
  const defraPath = path.resolve(__dirname, '../../../../data/defra_categories.csv');
  const transportPath = path.resolve(__dirname, '../../../../data/transport_factors.csv');

  const agriCsv = parseCSV(agribalysePath);
  const defraCsv = parseCSV(defraPath);
  const transportCsv = parseCSV(transportPath);

  const categoryMap = new Map<string, string>(); // name -> categoryId

  // First pass: Create categories without parents
  const allCsvCategories = [...agriCsv, ...defraCsv];
  for (const item of allCsvCategories) {
    const name = item.category_name;
    const unspscCode = item.unspsc_code || null;

    const cat = await prisma.category.create({
      data: {
        name,
        unspscCode,
      },
    });
    categoryMap.set(name, cat.categoryId);
  }

  // Second pass: Update parentId values
  for (const item of allCsvCategories) {
    if (item.parent_name) {
      const catId = categoryMap.get(item.category_name);
      const parentId = categoryMap.get(item.parent_name);
      if (catId && parentId) {
        await prisma.category.update({
          where: { categoryId: catId },
          data: { parentId },
        });
      }
    }
  }

  // 4. Create Emission Factors for categories dynamically
  console.log('⚡ Inserting emission factors from CSV rows...');
  const baseDate = new Date('2026-01-01T00:00:00Z');

  // Insert Agribalyse factors
  for (const item of agriCsv) {
    const co2e = parseFloat(item.co2e_per_kg);
    if (co2e > 0) {
      const categoryId = categoryMap.get(item.category_name);
      if (categoryId) {
        await prisma.emissionFactor.create({
          data: {
            sourceDataset: 'agribalyse',
            sourceCode: `AGRI_${item.category_name.toUpperCase().replace(/[^A-Z]/g, '_')}`,
            co2ePerKg: co2e,
            scopeType: 3,
            categoryId,
            validFrom: baseDate,
            metadata: { region: 'France/Europe', quality: 'high' },
          },
        });
      }
    }
  }

  // Insert DEFRA factors
  for (const item of defraCsv) {
    const co2e = parseFloat(item.co2e_per_kg);
    if (co2e > 0) {
      const categoryId = categoryMap.get(item.category_name);
      if (categoryId) {
        await prisma.emissionFactor.create({
          data: {
            sourceDataset: 'defra',
            sourceCode: `DEFRA_${item.category_name.toUpperCase().replace(/[^A-Z]/g, '_')}`,
            co2ePerKg: co2e,
            scopeType: 3,
            categoryId,
            validFrom: baseDate,
            metadata: { region: 'UK/Global', quality: 'medium' },
          },
        });
      }
    }
  }

  // 5. Seed Transport Factors dynamically from CSV
  console.log('🚚 Inserting transport factors from CSV rows...');
  for (const tf of transportCsv) {
    await prisma.transportFactor.create({
      data: {
        modeName: tf.mode_name,
        co2ePerKmPassenger: parseFloat(tf.co2e_per_km_passenger),
        co2ePerKmTon: parseFloat(tf.co2e_per_km_ton),
        sourceDataset: tf.source_dataset,
      },
    });
  }

  // 6. Create Partner Custom Product Catalog
  console.log('📦 Seeding standard products...');
  const products = [
    { sku: 'sku-bananas-001', title: 'Organic Bananas', categoryName: 'Fruits & Vegetables', gtin: '000000000001', weightGrams: 500 },
    { sku: 'sku-almondmilk-002', title: 'Almond Milk 1L', categoryName: 'Dairy & Eggs', gtin: '000000000002', weightGrams: 1000 },
    { sku: 'sku-beefsteak-003', title: 'Premium Beef Steak', categoryName: 'Meat & Seafood', gtin: '000000000003', weightGrams: 400 },
    { sku: 'sku-coffee-004', title: 'Arabica Coffee Beans 500g', categoryName: 'Coffee & Tea', gtin: '000000000004', weightGrams: 500 },
    { sku: 'sku-iphone-005', title: 'Greenphone 15', categoryName: 'Smartphones', gtin: '000000000005', weightGrams: 200 },
  ];

  for (const prod of products) {
    const categoryId = categoryMap.get(prod.categoryName);
    if (categoryId) {
      await prisma.productCatalog.create({
        data: {
          partnerId: partner.partnerId,
          sku: prod.sku,
          gtin: prod.gtin,
          title: prod.title,
          categoryId,
          attributes: {
            weight_grams: prod.weightGrams,
          },
        },
      });
    }
  }

  // 7. Create Partner Overrides
  console.log('🎛️ Seeding partner specific overrides...');
  await prisma.partnerOverride.create({
    data: {
      partnerId: partner.partnerId,
      sku: 'sku-bananas-001',
      customFactor: 0.35,
      justification: 'Locally sourced bananas from regenerative farm',
    },
  });

  await prisma.partnerOverride.create({
    data: {
      partnerId: partner.partnerId,
      sku: 'sku-iphone-005',
      customFactor: 45.00,
      justification: 'Uses 100% recycled aluminum and solar power for assembly',
    },
  });

  console.log('✨ Dynamic seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding CSV factors:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

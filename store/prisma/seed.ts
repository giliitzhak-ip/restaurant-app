import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import type { Prisma } from '../src/generated/prisma/client'
import bcrypt from 'bcryptjs'
import { CATEGORY_TREE, type CategorySeed } from './seed-data/categories'
import { RPC_PRODUCTS, RPC_BRAND } from './seed-data/rpc-products'
import { DEMO_PRODUCTS } from './seed-data/demo-products'
import { renderPlaceholderImage } from './seed-data/placeholder-image'
import { ingestImage, attachMediaToProduct } from '../src/lib/media/service'
import { DEFAULT_SETTINGS } from '../src/config/settings'
import { SOLVER_SEED } from './seed-data/solver'
import { CONTENT_PAGES } from './seed-data/content'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function seedCategories() {
  const ids = new Map<string, string>()

  async function upsert(node: CategorySeed, parentId: string | null, position: number) {
    const category = await prisma.category.upsert({
      where: { slug: node.slug },
      create: {
        slug: node.slug,
        name: node.name,
        nameEn: node.nameEn ?? null,
        description: node.description ?? null,
        parentId,
        position,
      },
      update: {
        name: node.name,
        nameEn: node.nameEn ?? null,
        description: node.description ?? null,
        parentId,
        position,
      },
    })
    ids.set(node.slug, category.id)
    for (const [index, child] of (node.children ?? []).entries()) {
      await upsert(child, category.id, index)
    }
  }

  for (const [index, node] of CATEGORY_TREE.entries()) await upsert(node, null, index)
  return ids
}

async function seedSuppliers() {
  const rpc = await prisma.supplier.upsert({
    where: { code: 'RPC' },
    create: {
      code: 'RPC',
      name: 'RPC',
      notes: 'ספק פנימי. שם הספק אינו מוצג ללקוח. פרטי קשר, זמן אספקה ומינימום הזמנה — ממתינים לעדכון.',
    },
    update: {},
  })
  const via = await prisma.supplier.upsert({
    where: { code: 'VIA' },
    create: {
      code: 'VIA',
      name: 'VIA Home',
      notes: 'ספק פנימי. קטגוריות placeholder בלבד עד לקבלת מחירון.',
    },
    update: {},
  })
  return { rpc, via }
}

async function linkCategories(productId: string, slugs: string[], primary: string, ids: Map<string, string>) {
  await prisma.productCategory.deleteMany({ where: { productId } })
  const unique = Array.from(new Set(slugs))
  for (const slug of unique) {
    const categoryId = ids.get(slug)
    if (!categoryId) continue
    await prisma.productCategory.create({
      data: { productId, categoryId, isPrimary: slug === primary },
    })
  }
}

async function seedRpcProducts(ids: Map<string, string>, supplierId: string) {
  for (const [index, seed] of RPC_PRODUCTS.entries()) {
    const product = await prisma.product.upsert({
      where: { slug: seed.slug },
      create: {
        slug: seed.slug,
        name: seed.name,
        nameEn: seed.nameEn ?? null,
        brand: RPC_BRAND,
        shortDescription: seed.typeNote,
        // Description, benefits, usage and warnings stay empty on purpose —
        // they may only be filled from verified supplier material.
        description: null,
        keywords: seed.keywords,
        kind: seed.kind,
        status: seed.status,
        published: false,
        poisonFree: seed.poisonFree ?? false,
        position: index,
        // No invented commercial data.
        sku: null,
        barcode: null,
        price: null,
        salePrice: null,
        costPrice: null,
        isDemoData: false,
      },
      update: {
        name: seed.name,
        nameEn: seed.nameEn ?? null,
        brand: RPC_BRAND,
        shortDescription: seed.typeNote,
        keywords: seed.keywords,
        kind: seed.kind,
        position: index,
      },
    })

    await linkCategories(product.id, seed.categorySlugs, seed.primaryCategorySlug, ids)

    await prisma.regulatoryRecord.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        status: 'REQUIRES_VERIFICATION',
        publicUseAllowed: null,
        registrationNumber: null,
        registrationAuthority: null,
        labelUrl: null,
        labelVersion: null,
        labelVerifiedAt: null,
        sourceOfInformation: null,
        targetPests: [],
        allowedLocations: [],
        usageInstructions: null,
        warnings: null,
        notes: 'נוצר אוטומטית מקטלוג ההתחלה. כל השדות ממתינים לאימות מול תווית רשמית.',
      },
      update: {},
    })

    await prisma.inventory.upsert({
      where: { productId: product.id },
      create: { productId: product.id, onHand: 0, reserved: 0, reorderPoint: 0 },
      update: {},
    })

    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId: product.id } },
      create: { supplierId, productId: product.id, isPreferred: true },
      update: {},
    })
  }
}

async function seedDemoProducts(ids: Map<string, string>) {
  for (const [index, seed] of DEMO_PRODUCTS.entries()) {
    const product = await prisma.product.upsert({
      where: { slug: seed.slug },
      create: {
        slug: seed.slug,
        name: seed.name,
        shortDescription: seed.shortDescription,
        description: seed.description,
        benefits: seed.benefits,
        suitableFor: seed.suitableFor,
        keywords: seed.keywords,
        kind: 'GENERAL',
        status: 'PUBLISHED',
        published: true,
        publishedAt: new Date(),
        isDemoData: true,
        poisonFree: seed.poisonFree ?? false,
        readyToUse: true,
        environment: 'BOTH',
        sku: `DEMO-${String(index + 1).padStart(3, '0')}`,
        price: seed.price,
        salePrice: seed.salePrice ?? null,
        costPrice: seed.costPrice ?? null,
        isBestSeller: seed.isBestSeller ?? false,
        isNew: seed.isNew ?? false,
        position: index,
        stockPolicy: 'SHOW_UNAVAILABLE',
      },
      update: {
        name: seed.name,
        shortDescription: seed.shortDescription,
        description: seed.description,
        price: seed.price,
        salePrice: seed.salePrice ?? null,
        costPrice: seed.costPrice ?? null,
      },
    })

    await linkCategories(product.id, seed.categorySlugs, seed.primaryCategorySlug, ids)

    await prisma.inventory.upsert({
      where: { productId: product.id },
      create: { productId: product.id, onHand: seed.stock, reserved: 0, reorderPoint: 5 },
      update: { onHand: seed.stock },
    })

    const existingMedia = await prisma.productMedia.count({ where: { productId: product.id } })
    if (existingMedia === 0) {
      const buffer = await renderPlaceholderImage(seed.name, seed.placeholderHue)
      const media = await ingestImage({
        fileName: `${seed.slug}.png`,
        buffer,
        declaredMime: 'image/png',
        alt: `${seed.name} — תמונת המחשה`,
        folder: 'demo',
      })
      await attachMediaToProduct(product.id, media.mediaId, `${seed.name} — תמונת המחשה`)
    }
  }
}

async function seedAdminUser() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'
  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name: 'מנהל המערכת', role: 'SUPER_ADMIN' },
    update: {},
  })
  return { email, password: process.env.SEED_ADMIN_PASSWORD ? '(from SEED_ADMIN_PASSWORD)' : password }
}

async function seedSettings() {
  for (const [key, entry] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: entry.value as Prisma.InputJsonValue, group: entry.group },
      update: {},
    })
  }
}

async function seedShipping() {
  const existing = await prisma.shippingZone.count()
  if (existing > 0) return
  const zone = await prisma.shippingZone.create({
    data: { name: 'ארצי', isDefault: true, cities: [] },
  })
  await prisma.shippingRate.createMany({
    data: [
      { zoneId: zone.id, method: 'COURIER', label: 'שליח עד הבית', price: 2900, freeOver: 24900, etaText: '3-5 ימי עסקים' },
      { zoneId: zone.id, method: 'PICKUP_POINT', label: 'נקודת איסוף', price: 1900, freeOver: 19900, etaText: '2-4 ימי עסקים' },
      { zoneId: zone.id, method: 'SELF_PICKUP', label: 'איסוף עצמי', price: 0, etaText: 'בתיאום מראש' },
    ],
  })
}

async function seedSolver(ids: Map<string, string>) {
  for (const [index, pest] of SOLVER_SEED.entries()) {
    const record = await prisma.solverPest.upsert({
      where: { slug: pest.slug },
      create: { slug: pest.slug, name: pest.name, intro: pest.intro, position: index },
      update: { name: pest.name, intro: pest.intro, position: index },
    })
    for (const [qIndex, question] of pest.questions.entries()) {
      await prisma.solverQuestion.upsert({
        where: { pestId_key: { pestId: record.id, key: question.key } },
        create: {
          pestId: record.id,
          key: question.key,
          prompt: question.prompt,
          position: qIndex,
          options: question.options as unknown as Prisma.InputJsonValue,
        },
        update: {
          prompt: question.prompt,
          position: qIndex,
          options: question.options as unknown as Prisma.InputJsonValue,
        },
      })
    }
    // Product matches point at the category's published products at query
    // time; explicit matches are added by the admin once products are verified.
    void ids
  }
}

async function seedContent() {
  for (const [index, page] of CONTENT_PAGES.entries()) {
    await prisma.contentPage.upsert({
      where: { slug: page.slug },
      create: { ...page, position: index },
      update: { title: page.title, bodyHtml: page.bodyHtml, excerpt: page.excerpt },
    })
  }
}

async function main() {
  console.log('▶ seeding categories…')
  const categoryIds = await seedCategories()

  console.log('▶ seeding suppliers…')
  const { rpc } = await seedSuppliers()

  console.log('▶ seeding RPC starter catalogue (draft / requires verification)…')
  await seedRpcProducts(categoryIds, rpc.id)

  console.log('▶ seeding demo home products…')
  await seedDemoProducts(categoryIds)

  console.log('▶ seeding settings, shipping, solver, content…')
  await seedSettings()
  await seedShipping()
  await seedSolver(categoryIds)
  await seedContent()

  const admin = await seedAdminUser()

  const counts = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    published: await prisma.product.count({ where: { published: true } }),
    awaitingVerification: await prisma.regulatoryRecord.count({ where: { status: 'REQUIRES_VERIFICATION' } }),
    media: await prisma.media.count(),
  }

  console.log('\n✔ seed complete')
  console.table(counts)
  console.log(`\nAdmin login: ${admin.email} / ${admin.password}`)
  console.log('RPC products are NOT published and carry REQUIRES_VERIFICATION.\n')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

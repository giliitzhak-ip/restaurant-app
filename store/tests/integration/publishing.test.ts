import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { changeProductStatus, publishDecisionFor } from '@/lib/catalog/product-service'
import { listCatalogProducts, getPublishedProductBySlug } from '@/lib/catalog/queries'
import { testDb, createTestProduct, cleanupTestData } from '../helpers/db'

describe('product publishing restrictions', () => {
  beforeEach(cleanupTestData)
  afterAll(async () => {
    await cleanupTestData()
    await testDb.$disconnect()
  })

  it('refuses to publish a pest-control product that has not been verified', async () => {
    const product = await createTestProduct({ kind: 'PEST_CONTROL', published: false })
    await testDb.regulatoryRecord.create({
      data: { productId: product.id, status: 'REQUIRES_VERIFICATION' },
    })
    await testDb.product.update({ where: { id: product.id }, data: { status: 'READY_TO_PUBLISH' } })

    const result = await changeProductStatus(product.id, 'PUBLISHED')
    expect(result.ok).toBe(false)
    expect(result.blockers?.length).toBeGreaterThan(0)

    const after = await testDb.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.published).toBe(false)
    expect(after.status).toBe('READY_TO_PUBLISH')
  })

  it('publishes a pest-control product once it is fully verified', async () => {
    const product = await createTestProduct({ kind: 'PEST_CONTROL', published: false })
    await testDb.regulatoryRecord.create({
      data: {
        productId: product.id,
        status: 'VERIFIED_PUBLIC_USE',
        publicUseAllowed: true,
        registrationNumber: 'REG-TEST-1',
        registrationAuthority: 'רשות בדיקה',
        labelVerifiedAt: new Date(),
      },
    })
    await testDb.product.update({ where: { id: product.id }, data: { status: 'READY_TO_PUBLISH' } })

    const decision = await publishDecisionFor(product.id)
    expect(decision.blockers).toEqual([])

    const result = await changeProductStatus(product.id, 'PUBLISHED')
    expect(result.ok).toBe(true)

    const after = await testDb.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.published).toBe(true)
    expect(after.publishedAt).toBeInstanceOf(Date)
  })

  it('refuses to publish without a price or an image', async () => {
    const noPrice = await createTestProduct({ price: null, published: false })
    await testDb.product.update({ where: { id: noPrice.id }, data: { status: 'READY_TO_PUBLISH' } })
    expect((await changeProductStatus(noPrice.id, 'PUBLISHED')).blockers).toContain('לא הוגדר מחיר מכירה')

    const noMedia = await createTestProduct({ withMedia: false, published: false })
    await testDb.product.update({ where: { id: noMedia.id }, data: { status: 'READY_TO_PUBLISH' } })
    expect((await changeProductStatus(noMedia.id, 'PUBLISHED')).blockers).toContain('לא הועלתה אף תמונה למוצר')
  })

  it('rejects an illegal status transition', async () => {
    const product = await createTestProduct({ published: false })
    const result = await changeProductStatus(product.id, 'PUBLISHED')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('מעבר סטטוס זה אינו מותר')
  })

  it('keeps professional-only products out of the storefront even if flagged published', async () => {
    const product = await createTestProduct({ kind: 'PEST_CONTROL' })
    await testDb.regulatoryRecord.create({ data: { productId: product.id, status: 'PROFESSIONAL_ONLY' } })

    const listed = await listCatalogProducts({ search: product.name })
    expect(listed.items.find((p) => p.id === product.id)).toBeUndefined()
    expect(await getPublishedProductBySlug(product.slug)).toBeNull()
  })

  it('keeps unpriced products out of the storefront listing', async () => {
    const product = await createTestProduct({ price: null })
    const listed = await listCatalogProducts({ search: product.name })
    expect(listed.items.find((p) => p.id === product.id)).toBeUndefined()
  })

  it('lists a fully published product', async () => {
    const product = await createTestProduct()
    const listed = await listCatalogProducts({ search: product.name })
    expect(listed.items.find((p) => p.id === product.id)).toBeDefined()
    expect(await getPublishedProductBySlug(product.slug)).not.toBeNull()
  })
})

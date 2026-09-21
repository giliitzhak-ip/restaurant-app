import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { PUBLIC_PRODUCT_WHERE } from '@/lib/catalog/queries'
import { effectivePrice } from '@/lib/money'
import { placeOrder, applyPaymentResult, transitionOrder, refundOrder, OutOfStockError } from '@/lib/orders/service'
import type { OrderStatus } from '@/generated/prisma/enums'
import {
  SeededRandom, CITIES, COURIER_NOTES, FIRST_NAMES, LAST_NAMES, STREETS, SIMULATION_EMAIL_DOMAIN,
} from './random'
import { SCENARIOS, type ScenarioKey } from './scenarios'

export interface SimulationOptions {
  /** How many orders/carts to generate. */
  count: number
  /** Restrict to these scenarios; empty means the weighted mix. */
  scenarios?: ScenarioKey[]
  /** Spread the generated activity over this many days back from today. */
  spreadDays: number
  /** Same seed → same run. */
  seed?: number
}

export interface ScenarioOutcome {
  scenario: ScenarioKey
  ok: boolean
  orderNumber?: string
  detail: string
}

export interface SimulationReport {
  seed: number
  requested: number
  created: number
  failed: number
  byScenario: Record<string, number>
  outcomes: ScenarioOutcome[]
  warnings: string[]
}

export class SimulatorUnavailableError extends Error {}

/**
 * The simulator writes real orders. It is off in production unless explicitly
 * switched on, so it can never be triggered by accident on a live shop.
 */
export function simulatorEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.ENABLE_SIMULATOR === 'true'
}

interface SimProduct {
  id: string
  name: string
  price: number
  available: number
  backorder: boolean
}

async function loadSellableProducts(): Promise<SimProduct[]> {
  const rows = await prisma.product.findMany({
    where: PUBLIC_PRODUCT_WHERE,
    select: {
      id: true, name: true, price: true, salePrice: true, stockPolicy: true,
      inventory: { select: { onHand: true, reserved: true } },
    },
  })

  return rows.flatMap((row) => {
    const price = effectivePrice(row.price, row.salePrice)
    if (price === null) return []
    return [{
      id: row.id,
      name: row.name,
      price,
      available: (row.inventory?.onHand ?? 0) - (row.inventory?.reserved ?? 0),
      backorder: row.stockPolicy === 'ALLOW_BACKORDER',
    }]
  })
}

/**
 * Picks the next scenario. Ticking scenarios explicitly spreads the run evenly
 * across exactly those — what the operator asked for. Leaving the selection
 * empty falls back to the realistic weighted mix, which deliberately excludes
 * zero-weight scenarios such as the overselling probe.
 */
function nextScenario(random: SeededRandom, allowed: ScenarioKey[], explicit: boolean): ScenarioKey {
  if (explicit) return random.pick(allowed)

  const usable = SCENARIOS.filter((s) => allowed.includes(s.key) && s.weight > 0)
  if (usable.length === 0) return random.pick(allowed)

  const total = usable.reduce((sum, s) => sum + s.weight, 0)
  let ticket = random.next() * total
  for (const scenario of usable) {
    ticket -= scenario.weight
    if (ticket <= 0) return scenario.key
  }
  return usable[usable.length - 1].key
}

function identity(random: SeededRandom, index: number) {
  const firstName = random.pick(FIRST_NAMES)
  const lastName = random.pick(LAST_NAMES)
  return {
    fullName: `${firstName} ${lastName}`,
    email: `sim-${Date.now().toString(36)}-${index}@${SIMULATION_EMAIL_DOMAIN}`,
    phone: `05${random.int(0, 8)}${String(random.int(1000000, 9999999))}`,
    city: random.pick(CITIES),
    street: random.pick(STREETS),
    houseNumber: String(random.int(1, 90)),
    apartment: random.bool(0.6) ? String(random.int(1, 30)) : undefined,
    floor: random.bool(0.5) ? String(random.int(0, 12)) : undefined,
    courierNote: random.pick(COURIER_NOTES) || undefined,
  }
}

/** Order lines that respect the stock actually on hand. */
function buildBasket(random: SeededRandom, products: SimProduct[], overshoot: boolean) {
  const sellable = overshoot ? products : products.filter((p) => p.backorder || p.available > 0)
  if (sellable.length === 0) return []

  const chosen = random.sample(sellable, random.int(1, Math.min(3, sellable.length)))
  return chosen.map((product) => {
    const max = product.backorder ? 3 : Math.max(1, Math.min(3, product.available))
    const quantity = overshoot ? Math.max(1, product.available) + random.int(1, 5) : random.int(1, max)
    return { product, quantity }
  })
}

async function createCart(lines: { product: SimProduct; quantity: number }[]): Promise<string> {
  const token = `sim-${randomUUID()}`
  const cart = await prisma.cart.create({ data: { token } })
  for (const line of lines) {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: line.product.id, quantity: line.quantity, unitPrice: line.product.price },
    })
  }
  return token
}

async function backdate(orderId: string, createdAt: Date): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { createdAt } })
  await prisma.orderEvent.updateMany({ where: { orderId }, data: { createdAt } })
}

async function markPaid(orderId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({ where: { orderId } })
  if (!payment?.providerRef) return false
  const result = await applyPaymentResult({
    provider: payment.provider,
    externalId: `sim_${randomUUID()}`,
    providerRef: payment.providerRef,
    status: 'PAID',
    payloadHash: 'simulated',
  })
  return result.applied
}

const FULFILMENT_PATH: OrderStatus[] = ['PROCESSING', 'PACKING', 'READY_FOR_SHIPPING', 'SHIPPED', 'DELIVERED']

async function advanceThrough(orderId: string, path: OrderStatus[]): Promise<void> {
  for (const status of path) {
    const result = await transitionOrder(orderId, status, { notify: false })
    if (!result.ok) break
  }
}

/**
 * Runs the requested number of scenarios against the live domain services and
 * returns a report. Every order and customer it creates is flagged
 * `isSimulated` so it can be listed and purged cleanly.
 */
export async function runSimulation(options: SimulationOptions): Promise<SimulationReport> {
  if (!simulatorEnabled()) {
    throw new SimulatorUnavailableError(
      'הסימולטור מושבת בסביבת Production. להפעלה זמנית הגדירו ENABLE_SIMULATOR=true.',
    )
  }

  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000)
  const random = new SeededRandom(seed)
  const count = Math.max(1, Math.min(200, Math.round(options.count)))
  const spreadDays = Math.max(0, Math.min(365, Math.round(options.spreadDays)))
  const explicit = Boolean(options.scenarios?.length)
  const allowed = explicit ? options.scenarios! : SCENARIOS.map((s) => s.key)

  const warnings: string[] = []
  const products = await loadSellableProducts()
  if (products.length === 0) {
    return {
      seed, requested: count, created: 0, failed: 0, byScenario: {}, outcomes: [],
      warnings: ['אין מוצרים מפורסמים עם מחיר — הסימולטור לא יכול לייצר הזמנות. פרסמו מוצר תחילה.'],
    }
  }

  const outcomes: ScenarioOutcome[] = []
  const byScenario: Record<string, number> = {}

  for (let index = 0; index < count; index += 1) {
    const scenario = nextScenario(random, allowed, explicit)
    const createdAt = new Date(Date.now() - random.int(0, spreadDays) * 86_400_000 - random.int(0, 86_399) * 1000)
    const person = identity(random, index)

    try {
      const outcome = await runScenario({ scenario, random, products, person, createdAt })
      outcomes.push(outcome)
      byScenario[scenario] = (byScenario[scenario] ?? 0) + 1

      // Keep the in-memory stock view in step so later orders stay realistic.
      if (outcome.ok && outcome.consumed) {
        for (const line of outcome.consumed) {
          const tracked = products.find((p) => p.id === line.productId)
          if (tracked && !tracked.backorder) tracked.available = Math.max(0, tracked.available - line.quantity)
        }
      }
    } catch (error) {
      outcomes.push({
        scenario,
        ok: false,
        detail: error instanceof Error ? error.message : 'שגיאה לא ידועה',
      })
    }
  }

  const failed = outcomes.filter((o) => !o.ok).length
  if (products.every((p) => !p.backorder && p.available <= 0)) {
    warnings.push('המלאי של כל המוצרים אזל במהלך הריצה — הזמנות נוספות ייכשלו עד לעדכון מלאי.')
  }

  return {
    seed,
    requested: count,
    created: outcomes.filter((o) => o.ok).length,
    failed,
    byScenario,
    outcomes,
    warnings,
  }
}

interface RunScenarioInput {
  scenario: ScenarioKey
  random: SeededRandom
  products: SimProduct[]
  person: ReturnType<typeof identity>
  createdAt: Date
}

type ScenarioRunOutcome = ScenarioOutcome & { consumed?: { productId: string; quantity: number }[] }

async function runScenario({ scenario, random, products, person, createdAt }: RunScenarioInput): Promise<ScenarioRunOutcome> {
  if (scenario === 'ABANDONED_CART') {
    const lines = buildBasket(random, products, false)
    if (lines.length === 0) return { scenario, ok: false, detail: 'אין מוצרים זמינים לעגלה' }
    const token = await createCart(lines)
    await prisma.cart.update({ where: { token }, data: { createdAt, updatedAt: createdAt } })
    return { scenario, ok: true, detail: `עגלה נטושה עם ${lines.length} פריטים` }
  }

  if (scenario === 'OUT_OF_STOCK') {
    const lines = buildBasket(random, products.filter((p) => !p.backorder), true)
    if (lines.length === 0) return { scenario, ok: false, detail: 'אין מוצר מוגבל מלאי לבדיקה' }
    const token = await createCart(lines)
    try {
      await placeOrder(orderInput(token, person, createdAt))
      return { scenario, ok: false, detail: 'אזהרה: המערכת אישרה הזמנה מעבר למלאי הזמין' }
    } catch (error) {
      await prisma.cart.deleteMany({ where: { token } })
      if (error instanceof OutOfStockError) {
        return { scenario, ok: true, detail: `נדחה כצפוי: ${error.message}` }
      }
      return { scenario, ok: true, detail: error instanceof Error ? error.message : 'נדחה' }
    }
  }

  const lines = buildBasket(random, products, false)
  if (lines.length === 0) return { scenario, ok: false, detail: 'אין מוצרים זמינים במלאי' }

  const token = await createCart(lines)
  const { order } = await placeOrder(orderInput(token, person, createdAt))
  await prisma.cart.deleteMany({ where: { token } })
  await backdate(order.id, createdAt)

  const consumed = lines.map((line) => ({ productId: line.product.id, quantity: line.quantity }))

  switch (scenario) {
    case 'AWAITING_PAYMENT':
      return { scenario, ok: true, orderNumber: order.orderNumber, detail: 'נוצרה וממתינה לתשלום', consumed }

    case 'PAYMENT_FAILED': {
      const payment = await prisma.payment.findFirst({ where: { orderId: order.id } })
      if (payment?.providerRef) {
        await applyPaymentResult({
          provider: payment.provider,
          externalId: `sim_${randomUUID()}`,
          providerRef: payment.providerRef,
          status: 'FAILED',
          payloadHash: 'simulated',
        })
      }
      // The reservation was released, so nothing was consumed.
      return { scenario, ok: true, orderNumber: order.orderNumber, detail: 'התשלום נכשל והשריון שוחרר' }
    }

    case 'CANCELLED': {
      await transitionOrder(order.id, 'CANCELLED', { notify: false })
      return { scenario, ok: true, orderNumber: order.orderNumber, detail: 'בוטלה לפני תשלום' }
    }

    case 'IN_FULFILMENT': {
      await markPaid(order.id)
      const depth = random.int(1, 4)
      await advanceThrough(order.id, FULFILMENT_PATH.slice(0, depth))
      const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } })
      return { scenario, ok: true, orderNumber: order.orderNumber, detail: `בטיפול — ${current.status}`, consumed }
    }

    case 'REFUNDED': {
      await markPaid(order.id)
      await advanceThrough(order.id, FULFILMENT_PATH)
      const full = random.bool(0.6)
      const amount = full ? order.grandTotal : Math.max(100, Math.round(order.grandTotal / 2))
      const result = await refundOrder(order.id, amount, full ? 'החזרת מוצר' : 'זיכוי חלקי — פריט פגום', null, { notify: false })
      return {
        scenario,
        ok: result.ok,
        orderNumber: order.orderNumber,
        detail: result.ok ? (full ? 'זוכתה במלואה' : 'זוכתה חלקית') : result.error ?? 'הזיכוי נכשל',
        consumed,
      }
    }

    case 'HAPPY_PATH':
    default: {
      await markPaid(order.id)
      await advanceThrough(order.id, FULFILMENT_PATH)
      return { scenario: 'HAPPY_PATH', ok: true, orderNumber: order.orderNumber, detail: 'הושלמה ונמסרה', consumed }
    }
  }
}

function orderInput(token: string, person: ReturnType<typeof identity>, createdAt: Date) {
  return {
    cartToken: token,
    email: person.email,
    phone: person.phone,
    shippingAddress: {
      fullName: person.fullName,
      city: person.city,
      street: person.street,
      houseNumber: person.houseNumber,
      apartment: person.apartment,
      floor: person.floor,
      courierNote: person.courierNote,
    },
    shippingMethod: 'COURIER',
    shippingPrice: 2900,
    marketingOptIn: false,
    isSimulated: true,
    notify: false,
    customerNote: `נוצר על ידי הסימולטור · ${createdAt.toISOString().slice(0, 10)}`,
  }
}

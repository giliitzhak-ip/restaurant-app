import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getPaymentProvider } from '@/lib/payments'
import { applyPaymentResult } from '@/lib/orders/service'

export const dynamic = 'force-dynamic'

/**
 * Signature is verified before anything is parsed, and every event id is
 * recorded, so replayed or duplicated deliveries change nothing.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  const provider = getPaymentProvider()
  let event
  try {
    event = await provider.handleWebhook(rawBody, headers)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const result = await applyPaymentResult({
    provider: provider.name,
    externalId: event.externalId,
    providerRef: event.providerRef,
    status: event.status,
    payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
  })

  return NextResponse.json({ received: true, applied: result.applied })
}

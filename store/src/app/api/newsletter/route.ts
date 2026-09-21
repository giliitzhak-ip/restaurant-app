import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/auth/rate-limit'

const schema = z.object({ email: z.string().email() })

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon'
  if (!rateLimit(`newsletter:${ip}`, 5, 600).allowed) {
    return NextResponse.redirect(new URL('/?newsletter=throttled', request.url), 303)
  }

  const form = await request.formData()
  const parsed = schema.safeParse({ email: form.get('email') })
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/?newsletter=invalid', request.url), 303)
  }

  // Marketing consent is explicit and recorded; nothing is sent before it.
  await prisma.customer.upsert({
    where: { email: parsed.data.email },
    create: { email: parsed.data.email, isGuest: true, marketingOptIn: true },
    update: { marketingOptIn: true },
  })

  return NextResponse.redirect(new URL('/?newsletter=ok', request.url), 303)
}

import { prisma } from '@/lib/db'
import { getEnv } from '@/lib/env'
import type { Prisma } from '@/generated/prisma/client'

export type EmailTemplate =
  | 'ORDER_CONFIRMATION'
  | 'PAYMENT_CONFIRMATION'
  | 'PACKING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUND'
  | 'ABANDONED_CART'

export interface SendEmailInput {
  to: string
  template: EmailTemplate
  subject: string
  data?: Record<string, unknown>
}

export interface EmailProvider {
  readonly name: string
  send(input: SendEmailInput): Promise<void>
}

/** Development provider: records the notification and logs it. */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console'
  async send(input: SendEmailInput): Promise<void> {
    console.info(`[email:${input.template}] → ${input.to}: ${input.subject}`)
  }
}

let cached: EmailProvider | null = null

function provider(): EmailProvider {
  if (cached) return cached
  const env = getEnv()
  switch (env.EMAIL_PROVIDER) {
    case 'console':
      cached = new ConsoleEmailProvider()
      break
    default:
      throw new Error(`ספק הדוא״ל "${env.EMAIL_PROVIDER}" אינו מוגדר.`)
  }
  return cached
}

/** Queues and sends a transactional message, recording the attempt. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      channel: 'EMAIL',
      template: input.template,
      recipient: input.to,
      subject: input.subject,
      payload: (input.data ?? {}) as Prisma.InputJsonValue,
      status: 'QUEUED',
    },
  })
  try {
    await provider().send(input)
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
  } catch (error) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'FAILED', error: error instanceof Error ? error.message : 'unknown' },
    })
  }
}

/** SMS / WhatsApp seam — implemented once a provider is contracted. */
export interface MessagingProvider {
  readonly name: string
  sendSms(to: string, body: string): Promise<void>
  sendWhatsApp(to: string, template: string, data: Record<string, unknown>): Promise<void>
}

export function getMessagingProvider(): MessagingProvider {
  throw new Error('ספק SMS/WhatsApp עדיין לא חובר. יש להוסיף מימוש ל-MessagingProvider.')
}

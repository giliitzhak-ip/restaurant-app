import { describe, expect, it, beforeEach } from 'vitest'
import { hashPassword, verifyPassword, passwordIssues } from '@/lib/auth/password'
import { createSessionToken, readSessionToken } from '@/lib/auth/session'
import { rateLimit, resetRateLimits } from '@/lib/auth/rate-limit'

describe('password hashing', () => {
  it('never stores the plaintext and verifies correctly', async () => {
    const hash = await hashPassword('CorrectHorse12')
    expect(hash).not.toContain('CorrectHorse12')
    expect(await verifyPassword('CorrectHorse12', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('enforces a minimum password policy', () => {
    expect(passwordIssues('short1')).not.toHaveLength(0)
    expect(passwordIssues('alllettersnodigit')).not.toHaveLength(0)
    expect(passwordIssues('Str0ngEnough1')).toHaveLength(0)
  })
})

describe('session tokens', () => {
  it('round-trips a signed session', async () => {
    const token = await createSessionToken({ userId: 'u1', email: 'a@b.co', name: 'א', role: 'ADMIN' })
    const session = await readSessionToken(token)
    expect(session).toMatchObject({ userId: 'u1', role: 'ADMIN' })
  })

  it('rejects a tampered token', async () => {
    const token = await createSessionToken({ userId: 'u1', email: 'a@b.co', name: 'א', role: 'ADMIN' })
    const [header, , signature] = token.split('.')
    const forged = `${header}.${Buffer.from(JSON.stringify({ userId: 'u1', role: 'SUPER_ADMIN' })).toString('base64url')}.${signature}`
    expect(await readSessionToken(forged)).toBeNull()
  })

  it('rejects garbage', async () => {
    expect(await readSessionToken('not-a-token')).toBeNull()
  })
})

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits())

  it('blocks once the window limit is exceeded', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit('key', 3, 60).allowed).toBe(true)
    }
    const blocked = rateLimit('key', 3, 60)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keeps buckets independent', () => {
    expect(rateLimit('a', 1, 60).allowed).toBe(true)
    expect(rateLimit('a', 1, 60).allowed).toBe(false)
    expect(rateLimit('b', 1, 60).allowed).toBe(true)
  })
})

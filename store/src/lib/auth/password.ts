import bcrypt from 'bcryptjs'

const ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** Minimum password policy for staff and customer accounts. */
export function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < 10) issues.push('הסיסמה חייבת להכיל לפחות 10 תווים')
  if (!/[a-z]/i.test(password)) issues.push('הסיסמה חייבת להכיל אות')
  if (!/[0-9]/.test(password)) issues.push('הסיסמה חייבת להכיל ספרה')
  return issues
}

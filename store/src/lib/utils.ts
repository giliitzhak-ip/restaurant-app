import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Hebrew-safe slug: keeps Hebrew letters and digits, collapses everything else. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"״׳]/g, '')
    .replace(/[^a-z0-9֐-׿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function formatDateHe(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(d)
}

export const PENDING_LABEL = 'ממתין לעדכון'

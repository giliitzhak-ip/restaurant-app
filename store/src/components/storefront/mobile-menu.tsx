'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

export function MobileMenu({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex size-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden"
        aria-label="פתיחת תפריט"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-900/40"
            aria-label="סגירת התפריט"
            onClick={() => setOpen(false)}
          />
          <nav
            aria-label="תפריט ניווט"
            className="animate-rise absolute inset-y-0 w-[82%] max-w-xs bg-white p-5 shadow-lift end-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-bold">תפריט</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg hover:bg-ink-100"
                aria-label="סגירה"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <ul className="mt-6 space-y-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 text-sm font-medium text-ink-800 hover:bg-brand-50"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="pt-3">
                <Link href="/solver" onClick={() => setOpen(false)} className="block rounded-xl bg-brand-700 px-3 py-3 text-center text-sm font-semibold text-white">
                  מצאו פתרון לבעיה
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </>
  )
}

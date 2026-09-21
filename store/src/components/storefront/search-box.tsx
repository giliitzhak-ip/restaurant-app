'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search } from 'lucide-react'

interface Suggestion {
  slug: string
  name: string
  categoryName: string | null
}

export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const abortRef = useRef<AbortController | null>(null)

  // Debounced lookup. State only changes inside the timer callback, never
  // synchronously during the effect body.
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (value.trim().length < 2) {
        setSuggestions([])
        setOpen(false)
        return
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(value)}`, { signal: controller.signal })
        if (!response.ok) return
        const data: { items: Suggestion[] } = await response.json()
        setSuggestions(data.items)
        setOpen(data.items.length > 0)
      } catch {
        /* aborted or offline — suggestions are a nicety, not a requirement */
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setOpen(false)
          router.push(`/search?q=${encodeURIComponent(value)}`)
        }}
      >
        <label htmlFor="search-input" className="sr-only">חיפוש מוצרים</label>
        <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-ink-400 start-3.5" aria-hidden />
        <input
          id="search-input"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggestions"
          placeholder="שם מוצר, מותג, מק״ט או בעיה…"
          className="h-12 w-full rounded-pill border border-ink-200 bg-white ps-10 pe-4 text-sm outline-none focus:border-brand-400"
        />
      </form>

      {open && suggestions.length > 0 && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-card border border-ink-200 bg-white shadow-lift"
        >
          {suggestions.map((item) => (
            <li key={item.slug} role="option" aria-selected={false}>
              <Link href={`/product/${item.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-ink-50">
                <span className="font-medium text-ink-900">{item.name}</span>
                {item.categoryName && <span className="text-xs text-ink-400">{item.categoryName}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

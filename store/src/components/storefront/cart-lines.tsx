'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, BookmarkPlus, Undo2, ImageIcon } from 'lucide-react'
import { formatAgorot } from '@/lib/money'
import type { CartLine } from '@/lib/cart/service'
import { removeCartItemAction, setSavedForLaterAction, updateCartQuantityAction } from '@/app/actions/cart'

function LineRow({ line, saved }: { line: CartLine; saved: boolean }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn()
      router.refresh()
    })

  return (
    <li className={`flex gap-4 border-b border-ink-100 py-4 ${pending ? 'opacity-60' : ''}`}>
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-ink-200 bg-white">
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt={line.name} fill sizes="80px" className="product-image" />
        ) : (
          <span className="flex h-full items-center justify-center text-ink-300"><ImageIcon className="size-6" aria-hidden /></span>
        )}
      </div>

      <div className="flex-1">
        <Link href={`/product/${line.slug}`} className="text-sm font-semibold text-ink-900 hover:text-brand-700">
          {line.name}
        </Link>
        <p className="mt-1 text-sm text-ink-500">{formatAgorot(line.unitPrice)} ליחידה</p>

        {!saved && (
          <div className="mt-2.5 flex items-center gap-2">
            <label htmlFor={`qty-${line.id}`} className="sr-only">כמות עבור {line.name}</label>
            <select
              id={`qty-${line.id}`}
              value={line.quantity}
              disabled={pending}
              onChange={(e) => run(() => updateCartQuantityAction(line.id, Number(e.target.value)))}
              className="h-9 rounded-lg border border-ink-200 px-2 text-sm"
            >
              {Array.from({ length: Math.max(1, Math.min(20, line.maxQuantity ?? 20)) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {line.maxQuantity !== null && line.maxQuantity < line.quantity && (
              <span className="text-xs font-medium text-amber-700">במלאי {line.maxQuantity} בלבד</span>
            )}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-3 text-xs font-medium">
          <button type="button" disabled={pending} onClick={() => run(() => removeCartItemAction(line.id))} className="flex items-center gap-1 text-ink-500 hover:text-red-600">
            <Trash2 className="size-3.5" aria-hidden />הסרה
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => setSavedForLaterAction(line.id, !saved))} className="flex items-center gap-1 text-ink-500 hover:text-brand-700">
            {saved ? <><Undo2 className="size-3.5" aria-hidden />החזרה לעגלה</> : <><BookmarkPlus className="size-3.5" aria-hidden />שמירה למועד אחר</>}
          </button>
        </div>
      </div>

      <div className="text-sm font-bold text-ink-900">{formatAgorot(line.lineTotal)}</div>
    </li>
  )
}

export function CartLines({ lines, savedLines }: { lines: CartLine[]; savedLines: CartLine[] }) {
  return (
    <div>
      <ul>
        {lines.map((line) => (
          <LineRow key={line.id} line={line} saved={false} />
        ))}
      </ul>

      {savedLines.length > 0 && (
        <section className="mt-10">
          <h2 className="text-base font-bold text-ink-900">שמור למועד אחר</h2>
          <ul className="mt-2">
            {savedLines.map((line) => (
              <LineRow key={line.id} line={line} saved />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

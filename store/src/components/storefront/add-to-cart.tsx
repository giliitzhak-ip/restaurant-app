'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addToCartAction } from '@/app/actions/cart'

export function AddToCart({
  productId,
  maxQuantity,
  disabled,
}: {
  productId: string
  maxQuantity: number | null
  disabled?: boolean
}) {
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit(thenCheckout: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await addToCartAction(productId, quantity)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setAdded(true)
      router.refresh()
      if (thenCheckout) router.push('/checkout')
      else setTimeout(() => setAdded(false), 2200)
    })
  }

  const cap = maxQuantity ?? 99

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label htmlFor="quantity" className="text-sm font-medium text-ink-700">כמות</label>
        <div className="flex items-center rounded-xl border border-ink-200">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex size-10 items-center justify-center text-lg text-ink-700 disabled:opacity-40"
            aria-label="הפחתת כמות"
            disabled={quantity <= 1}
          >
            −
          </button>
          <input
            id="quantity"
            type="number"
            min={1}
            max={cap}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(cap, Number(e.target.value) || 1)))}
            className="h-10 w-12 border-0 text-center text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(cap, q + 1))}
            className="flex size-10 items-center justify-center text-lg text-ink-700 disabled:opacity-40"
            aria-label="הגדלת כמות"
            disabled={quantity >= cap}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={() => submit(false)} disabled={disabled || pending}>
          {added ? <Check className="size-4" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
          {added ? 'נוסף לעגלה' : 'הוספה לעגלה'}
        </Button>
        <Button size="lg" variant="outline" className="flex-1" onClick={() => submit(true)} disabled={disabled || pending}>
          קנייה מהירה
        </Button>
      </div>

      {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  )
}

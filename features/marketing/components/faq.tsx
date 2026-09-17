'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FaqItem {
  question: string;
  answer: string;
}

/** Accessible accordion: buttons, aria-expanded, and a controlled region id. */
export function Faq({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y rounded-xl border bg-card">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
                id={`faq-trigger-${index}`}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 p-4 text-start font-medium"
              >
                {item.question}
                <ChevronDown
                  className={cn('size-5 shrink-0 transition-transform', isOpen && 'rotate-180')}
                  aria-hidden
                />
              </button>
            </h3>
            <div
              id={`faq-panel-${index}`}
              role="region"
              aria-labelledby={`faq-trigger-${index}`}
              hidden={!isOpen}
              className="px-4 pb-4 text-sm text-muted-foreground"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}

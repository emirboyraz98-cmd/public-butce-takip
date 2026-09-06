"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type TabItem = {
  key: string;
  label: string;
  content: React.ReactNode;
  /**
   * Etiketin yanındaki sayı. Sıfır ve tanımsız aynı: rozet hiç çizilmez —
   * "0" göstermek, bakılacak bir şey varmış izlenimi veriyor.
   */
  badge?: number;
};

/**
 * Basit, erişilebilir sekme grubu.
 *
 * İçerikler sunucuda render edilip `content` olarak geçirilir; sekme
 * değiştirmek yeni istek atmaz, sadece görünürlük değişir. Ok tuşlarıyla
 * gezinme WAI-ARIA sekme deseniyle uyumludur.
 */
export function Tabs({
  items,
  defaultKey,
  className,
  ariaLabel = "Sekmeler",
}: {
  items: TabItem[];
  defaultKey?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const groupId = useId();
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: React.KeyboardEvent) {
    const index = items.findIndex((item) => item.key === active);
    if (index === -1) return;

    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    // Uçlarda başa/sona sarar.
    const next = items[(index + delta + items.length) % items.length];
    setActive(next.key);
    tabRefs.current[next.key]?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="border-border flex flex-wrap gap-1 border-b"
      >
        {items.map((item) => {
          const selected = item.key === active;
          return (
            <button
              key={item.key}
              ref={(el) => {
                tabRefs.current[item.key] = el;
              }}
              role="tab"
              type="button"
              id={`${groupId}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={`${groupId}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.key)}
              className={cn(
                "-mb-px min-h-11 border-b-2 px-4 py-2 text-sm font-semibold transition-colors sm:min-h-9",
                selected
                  ? "border-primary text-accent-text"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              {item.label}
              {item.badge ? (
                // Rozet seçili olsun olmasın dolu kırmızı: amacı sekmeye
                // BAKILMADIĞINDA da göze çarpmak.
                <span className="bg-primary text-primary-foreground ml-1.5 inline-block min-w-5 px-1 text-[11px] font-bold">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`${groupId}-panel-${item.key}`}
          aria-labelledby={`${groupId}-tab-${item.key}`}
          hidden={item.key !== active}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

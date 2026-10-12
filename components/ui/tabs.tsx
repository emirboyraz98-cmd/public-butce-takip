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
        /*
         * Telefonda sekmeler ızgaraya giriyor, tek satırda kaydırılmıyor.
         *
         * Önce yatay kaydırma denendi ama son sekme ("Bekleyen
         * aktarımlar") ekranın kenarında yarım kalıyordu: adı okunmuyor,
         * orada bir şey olduğu da ancak kaydırmayı denerseniz anlaşılıyor.
         * Dört sekmenin toplam genişliği 390px'in üstünde, yani yazıyı
         * küçültmek de çözmüyordu.
         *
         * İki sütunlu ızgarada dördü de tam görünüyor ve artık satır
         * kalmıyor. Geniş ekranda alışıldık tek satır alt çizgili şeride
         * dönüyor.
         */
        className="grid grid-cols-2 gap-1 sm:border-border sm:flex sm:border-b"
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
                /*
                 * Telefonda çerçeveli kutu, geniş ekranda alt çizgi.
                 * Izgarada alt çizgi, üst satırdaki sekmenin altında
                 * boşlukta asılı kalıyordu; kutu ise uygulamanın başka
                 * yerlerindeki segment denetimiyle (baz para birimi, dönem
                 * seçimi) aynı dili konuşuyor.
                 */
                "min-h-11 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-9 sm:px-4",
                "border-border border sm:-mb-px sm:border-0 sm:border-b-2",
                selected
                  ? "bg-primary text-primary-foreground sm:bg-transparent sm:border-primary sm:text-accent-text"
                  : "text-muted-foreground hover:text-foreground sm:border-transparent"
              )}
            >
              {item.label}
              {item.badge ? (
                // Rozet seçili olsun olmasın dolu kırmızı: amacı sekmeye
                // BAKILMADIĞINDA da göze çarpmak.
                <span
                  className={cn(
                    "ml-1.5 inline-block min-w-5 px-1 text-[11px] font-bold",
                    // Seçili sekmenin zemini zaten kırmızı; rozet orada
                    // ters renkte olmalı, yoksa zeminde kayboluyor.
                    selected
                      ? "bg-primary-foreground text-primary sm:bg-primary sm:text-primary-foreground"
                      : "bg-primary text-primary-foreground"
                  )}
                >
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

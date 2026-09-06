"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Kaç satırdan sonra kırpılacağı. */
const CLAMP_LINES = 2;

/**
 * Uzun açıklamalar dikey alanı yiyor. Telefonda 8-12 satıra çıkıyorlardı;
 * masaüstünde de sorun sürüyordu — Pozisyonlar kartının açıklaması tek
 * başına 180px, yani içeriğe ulaşmadan önce bir ekranın altıda biri.
 *
 * Metin iki satıra kırpılır, "Devamı" ile açılır. Kırpma artık her genişlikte
 * geçerli: masaüstünde kırpmamak, kullanıcıyı her sayfa açılışında aynı
 * açıklamayı görmeye ve boş yere kaydırmaya zorluyordu.
 *
 * Düğme yalnızca metin GERÇEKTEN taşıyorsa çıkar — iki satırlık bir
 * açıklamanın altında gereksiz bir "Devamı" durmasın diye taşma ölçülerek
 * karar verilir.
 */
export function CollapsibleText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Açıkken kırpma yok, ölçüm anlamsız olur; kapalıyken ölçülür.
      if (open) return;
      setOverflows(el.scrollHeight - el.clientHeight > 2);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, children]);

  return (
    <span className={cn("block", className)}>
      <span
        ref={ref}
        className={cn("block", !open && "line-clamp-2")}
        style={{ ["--tw-line-clamp" as string]: CLAMP_LINES }}
      >
        {children}
      </span>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-foreground mt-1 underline underline-offset-2"
        >
          {open ? "Daha az" : "Devamı"}
        </button>
      )}
    </span>
  );
}

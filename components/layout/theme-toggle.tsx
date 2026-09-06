"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
] as const;

/**
 * Tema seçimi — baz para birimiyle aynı iki düğmelik segment.
 *
 * Önce ay/güneş simgeli tek bir yuvarlak düğmeydi ve hangi temada
 * olunduğunu değil, basılınca NE OLACAĞINI gösteriyordu; ikisi karışıyordu.
 * Segment seçili olanı doğrudan işaretliyor.
 *
 * Sunucuda hangi temanın etkin olduğu bilinmiyor. İlk çizimde iki düğme de
 * işaretsiz bırakılıyor, tema ancak tarayıcıda okunduktan sonra
 * işaretleniyor: sunucunun tahmin edip yanılması, kısa bir an yanlış
 * düğmenin dolu görünmesi demek olurdu.
 */
/** Değişmeyen bir kaynak; abone olacak bir şey yok. */
const subscribeNothing = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // Sunucu anlık görüntüsü false, istemcininki true: hidrasyon bittiğinde
  // React yeniden çiziyor. `useEffect` içinde setState etmenin, aynı işi
  // fazladan bir tur render ile yapan hâli.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );

  const active = mounted ? (theme === "system" ? resolvedTheme : theme) : undefined;

  return (
    <div
      role="group"
      aria-label="Tema"
      className={cn("border-border flex border", className)}
    >
      {OPTIONS.map((option, i) => (
        <button
          key={option.value}
          type="button"
          suppressHydrationWarning
          aria-pressed={active === option.value}
          onClick={() => setTheme(option.value)}
          className={cn(
            "min-h-11 flex-1 px-3 text-[13px] font-semibold transition-colors sm:min-h-8",
            i > 0 && "border-border border-l",
            active === option.value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-foreground/7"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

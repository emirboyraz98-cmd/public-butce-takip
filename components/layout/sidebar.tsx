"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { cn } from "@/lib/utils";
import { forgetRange } from "@/lib/dashboard/rangePreference";
import { BaseCurrencySegment } from "@/components/layout/base-currency-segment";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export type NavItem = { href: string; label: string };

/** Kenar çubuğu bağlantıları; sıra teslimattakiyle aynı. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Genel Bakış" },
  { href: "/salary", label: "Maaş" },
  { href: "/income", label: "Gelir" },
  { href: "/expenses", label: "Giderler" },
  { href: "/budgets", label: "Bütçeler" },
  { href: "/investments", label: "Yatırımlar" },
  { href: "/reports", label: "Raporlar" },
  { href: "/settings", label: "Ayarlar" },
];

/**
 * 236px sabit kenar çubuğu — teslimatın uygulama kabuğu.
 *
 * Önceki menü yataydı ve üstte iki satıra taşıyordu. Dikey kenar çubuğu
 * hem sayfanın üstündeki ~150px'i içeriğe geri veriyor hem de bağlantı
 * sayısı arttıkça (Bütçeler, Raporlar geliyor) yeniden düzen gerektirmiyor.
 *
 * Etkin bağlantı dolu kırmızıyla işaretleniyor; sistemde kırmızı yalnızca
 * "birincil eylem" ve "negatif tutar" anlamına geldiği için, üçüncü anlam
 * olarak "bulunduğun yer" de aynı vurguyu hak ediyor.
 */
export function Sidebar({
  baseCurrency,
  fxNote,
}: {
  baseCurrency: "TRY" | "USD";
  /** Kur bilgisi satırı, ör. "TCMB kuru 19.08 · 41,86 ₺/$". */
  fxNote?: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Bir bağlantının adresi diğerinin ön eki olabiliyor (`/salary` ve
  // `/salary/settings` gibi); daha derin eşleşen bir bağlantı varsa üstteki
  // etkin sayılmaz, yoksa iki bağlantı birden vurgulanırdı.
  const isActive = (href: string) => {
    if (!pathname) return false;
    if (pathname === href) return true;
    const deeper = NAV_ITEMS.some(
      (i) => i.href !== href && i.href.startsWith(href) && pathname.startsWith(i.href)
    );
    return !deeper && pathname.startsWith(href);
  };

  function logout() {
    forgetRange();
    signOut({ callbackUrl: "/login" });
  }

  return (
    <aside className="border-border hidden w-[236px] flex-none flex-col border-r-2 lg:flex">
      <div className="border-border border-b-2 px-5 py-5">
        <div className="text-[19px] leading-tight font-extrabold tracking-tight">
          Bütçe Takip
        </div>
        {session?.user?.username && (
          <div className="text-accent-text mt-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
            @{session.user.username}
          </div>
        )}
      </div>

      <nav className="flex-1 py-2">
        <ul>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block px-5 py-3 text-[15px] transition-colors",
                    active
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-foreground/6"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-border space-y-2 border-t-2 px-5 py-4">
        <div className="eyebrow">Baz para birimi</div>
        <BaseCurrencySegment baseCurrency={baseCurrency} />
        <div className="eyebrow pt-1">Tema</div>
        <ThemeToggle />
        {fxNote && (
          <p className="text-muted-foreground text-[11px] leading-snug">
            {fxNote}
          </p>
        )}
        <button
          type="button"
          onClick={logout}
          className="text-muted-foreground hover:text-foreground pt-1 text-[13px] underline underline-offset-4"
        >
          Çıkış yap
        </button>
      </div>
    </aside>
  );
}

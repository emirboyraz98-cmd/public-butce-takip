"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboardIcon,
  MoreHorizontalIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
  WalletIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { forgetRange } from "@/lib/dashboard/rangePreference";
import { BaseCurrencySegment } from "@/components/layout/base-currency-segment";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Özet", icon: LayoutDashboardIcon },
  { href: "/income", label: "Gelir", icon: WalletIcon },
  { href: "/expenses", label: "Gider", icon: ReceiptTextIcon },
  { href: "/investments", label: "Yatırım", icon: TrendingUpIcon },
];

/** "Daha" panelinde açılan, alt çubuğa sığmayan rotalar. */
const MORE_LINKS: { href: string; label: string }[] = [
  { href: "/salary", label: "Maaş" },
  { href: "/budgets", label: "Bütçeler" },
  { href: "/reports", label: "Raporlar" },
  { href: "/settings", label: "Ayarlar" },
];

/**
 * Telefonun alt sekme çubuğu — teslimatta beş öğe.
 *
 * Beşincisi bir rota değil "Daha" paneli: uygulamada dokuz varış noktası
 * var, beş sekmeye sığmıyor. Taşanları gizlemek yerine panele almak,
 * hepsinin başparmakla erişilebilir kalmasını sağlıyor; alternatif olan
 * "sekmeleri daraltmak" 44px dokunma hedefini bozuyordu.
 */
export function MobileNav({
  baseCurrency,
  isAdmin,
}: {
  baseCurrency: "TRY" | "USD";
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(href + "/") ?? false);

  const moreActive = [...MORE_LINKS, { href: "/admin", label: "" }].some((l) =>
    isActive(l.href)
  );

  function logout() {
    forgetRange();
    signOut({ callbackUrl: "/login" });
  }

  return (
    <>
      {open && (
        <div
          className="bg-foreground/50 fixed inset-0 z-40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Diğer sayfalar"
          className="bg-background border-border fixed inset-x-0 bottom-0 z-50 border-t-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <div className="border-border flex items-center justify-between border-b-2 px-5 py-4">
            <div>
              <div className="text-[17px] font-extrabold">Bütçe Takip</div>
              {session?.user?.username && (
                <div className="text-accent-text text-[11px] font-semibold tracking-[0.08em] uppercase">
                  @{session.user.username}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Kapat"
              className="border-border flex size-11 items-center justify-center border"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          <ul className="divide-hairline">
            {[...MORE_LINKS, ...(isAdmin ? [{ href: "/admin", label: "Üye yönetimi" }] : [])].map(
              (link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-14 items-center justify-between px-5 text-[15px]",
                      isActive(link.href) && "text-accent-text font-semibold"
                    )}
                  >
                    {link.label}
                    <span aria-hidden className="text-muted-foreground">
                      ›
                    </span>
                  </Link>
                </li>
              )
            )}
          </ul>

          <div className="border-border space-y-2 border-t-2 px-5 py-4">
            <div className="eyebrow">Baz para birimi</div>
            <BaseCurrencySegment baseCurrency={baseCurrency} />
            <div className="eyebrow pt-1">Tema</div>
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="text-muted-foreground pt-2 text-[13px] underline underline-offset-4"
            >
              Çıkış yap
            </button>
          </div>
        </div>
      )}

      <nav className="bg-background border-border fixed inset-x-0 bottom-0 z-30 border-t-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="flex">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-[0.06em] uppercase",
                    active ? "text-accent-text" : "text-muted-foreground"
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              className={cn(
                "flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-[0.06em] uppercase",
                moreActive ? "text-accent-text" : "text-muted-foreground"
              )}
            >
              <MoreHorizontalIcon className="size-5" aria-hidden />
              Daha
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

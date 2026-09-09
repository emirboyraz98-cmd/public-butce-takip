import Link from "next/link";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { BaseCurrencySegment } from "@/components/layout/base-currency-segment";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ReplayTourButton } from "./replay-tour-button";
import { GmailImport, type TokenRow } from "./gmail-import";

/**
 * Uygulama ayarları.
 *
 * Teslimat kategorileri de bu ekrana taşıyordu ve bir süre öyle durdu; ama
 * kategori düzenlemesi pratikte kategorilerin KULLANILDIĞI yerde
 * gerekiyor — gider girerken eksik bir kategori fark ediliyor, ayarlara
 * gidilirken değil. Kategori yönetimi Gelir ve Giderler sayfalarındaki
 * kendi sayfalarına geri alındı; burada yalnızca ayarlar kaldı.
 */
export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  // Apps Script'in çağıracağı adres, sayfanın geldiği isteğin kendisinden
  // türetilir; böylece yerel ve canlı kurulumda ayrı ayar tutulmaz.
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  const [user, tokens] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true,
        username: true,
        baseCurrency: true,
        role: true,
        salaryPaymentMonthOffset: true,
      },
    }),
    prisma.importToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    }),
  ]);

  const tokenRows: TokenRow[] = tokens.map((t) => ({
    id: t.id,
    label: t.label,
    createdAt: t.createdAt.toISOString().slice(0, 10),
    lastUsedAt: t.lastUsedAt?.toISOString().slice(0, 10) ?? null,
  }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
          Ayarlar
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[13px]">
          @{user.username}
          {user.name && ` · ${user.name}`}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="border-border border">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                Ayarlar
              </h2>
            </header>
            <dl className="divide-hairline">
              <div className="px-4 py-3">
                <dt className="eyebrow">Baz para birimi</dt>
                <dd className="mt-1.5">
                  <BaseCurrencySegment baseCurrency={user.baseCurrency} />
                  <p className="text-muted-foreground mt-1.5 text-[12px] leading-snug">
                    Bütün tutarlar bu para birimine çevrilerek toplanır.
                  </p>
                </dd>
              </div>

              <div className="px-4 py-3">
                <dt className="eyebrow">Tema</dt>
                <dd className="mt-1.5">
                  <ThemeToggle />
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <dt className="eyebrow">Maaş ödeme gecikmesi</dt>
                  <dd className="mt-0.5 text-[13px]">
                    {user.salaryPaymentMonthOffset === 0
                      ? "Hak edildiği ay ödeniyor"
                      : `${user.salaryPaymentMonthOffset} ay sonra ödeniyor`}
                  </dd>
                </div>
                <Link
                  href="/salary/settings"
                  className="text-accent-text flex-none text-[13px] font-semibold underline underline-offset-4"
                >
                  Düzenle
                </Link>
              </div>

              <div className="px-4 py-3">
                <dt className="eyebrow">Verilerini dışa aktar</dt>
                <dd className="mt-1.5 space-y-2">
                  <p className="text-muted-foreground text-[12px] leading-snug">
                    Hiçbiri şifreni içermez. Excel dosyalarında tutarlar hem
                    kendi para biriminde hem de <strong>baz para biriminde</strong>{" "}
                    yazar; toplama ve pivot ikinci sütunla yapılır, çünkü
                    karışık para birimi toplanamaz.
                  </p>
                  <ul className="text-muted-foreground space-y-1 text-[12px] leading-snug">
                    <li>
                      <strong className="text-foreground">Kayıt dökümü</strong>{" "}
                      — girdiğin her kayıt tek satır; ekrandaki listenin
                      aynısı.
                    </li>
                    <li>
                      <strong className="text-foreground">Aylık döküm</strong>{" "}
                      — her ay ne olduğu. Kira gibi tekrarlayanlar, kart
                      taksitleri ve kredi taksitleri aylara yayılır, maaş da
                      dahildir. Excel&apos;de pivot tablo kuracaksan bu.
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      {/* download: tarayıcı dosyayı açmak yerine indirsin. */}
                      <a href="/api/export?format=csv" download>
                        Kayıt dökümü (.csv)
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href="/api/export?format=csv&scope=monthly" download>
                        Aylık döküm (.csv)
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href="/api/export?format=csv&scope=investments" download>
                        Yatırımlar (.csv)
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href="/api/export" download>
                        Tam yedek (.json)
                      </a>
                    </Button>
                  </div>
                </dd>
              </div>

              <div className="px-4 py-3">
                <dt className="eyebrow">Tanıtım turu</dt>
                <dd className="mt-1.5 space-y-2">
                  <p className="text-muted-foreground text-[12px] leading-snug">
                    Her sekmeye ilk girişinde çıkan kısa tanıtımı bir kez
                    tamamladıktan sonra tekrar görmezsin.
                  </p>
                  <ReplayTourButton />
                </dd>
              </div>

              {user.role === "ADMIN" && (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <dt className="eyebrow">Üye yönetimi</dt>
                    <dd className="text-muted-foreground mt-0.5 text-[13px]">
                      Kayıt olan hesapları onayla ya da kapat.
                    </dd>
                  </div>
                  <Link
                    href="/admin"
                    className="text-accent-text flex-none text-[13px] font-semibold underline underline-offset-4"
                  >
                    Aç
                  </Link>
                </div>
              )}
            </dl>
          </section>

          <section className="border-border border">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                Gmail ile ekstre aktarımı
              </h2>
            </header>
            <div className="p-4">
              <GmailImport tokens={tokenRows} baseUrl={baseUrl} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

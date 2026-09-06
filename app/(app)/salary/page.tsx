import Link from "next/link";
import { format } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recomputeMissingMonths } from "@/lib/salary/computeAndSave";
import { buildMonthCalendar } from "@/lib/salary/monthCalendar";
import { toDateKey } from "@/lib/salary/holidayCalendar";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { CalcInfo } from "@/components/ui/calc-info";
import { formatMoney, formatMonth } from "@/lib/format";
import { SalaryReconciliationTable } from "./salary-results-table";
import { SalaryCalendarCard } from "./salary-calendar-card";
import { SalaryTrendChart, type SalaryPoint } from "@/components/charts/SalaryTrendChart";

export default async function SalaryPage() {
  const session = await auth();
  const userId = session!.user.id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { salaryPaymentMonthOffset: true },
  });

  // Yalnızca sonucu olmayan ayları hesaplar. Kaynak veri değiştiğinde
  // aksiyonlar zaten tam hesaplamayı tetikliyor; sayfa açılışında hepsini
  // yeniden yazmak ziyaret başına onlarca gereksiz yazma demekti.
  let recomputeFailures: { month: string; error: string }[] = [];
  try {
    const summary = await recomputeMissingMonths(userId);
    recomputeFailures = summary.failed;
  } catch {
    // sayfa yine de mevcut sonuçlarla render edilir
  }

  const [results, holidays, baseSalaryRates, dayExceptionRows] =
    await Promise.all([
    prisma.monthlySalaryResult.findMany({
      where: { userId },
      orderBy: { month: "desc" },
    }),
    prisma.publicHoliday.findMany(),
    prisma.baseSalaryRate.findMany({
      where: { userId },
      select: { mode: true, effectiveFrom: true, effectiveTo: true },
    }),
    prisma.salaryDayException.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    }),
  ]);

  /*
   * Maaş türü artık kullanıcının tamamına değil, baz maaş dönemine ait.
   * Takvim, değişken dönemi OLAN herkese gösteriliyor — sabit bir döneme
   * geçmiş olsa bile geçmiş değişken aylarını gün gün görebilmeli. Hiç
   * dönem girmemiş kullanıcı da görüyor: yeni hesabın varsayılanı değişken
   * ve ilk günü işaretleyebilmesi gerekiyor.
   */
  const hasVariable =
    baseSalaryRates.length === 0 ||
    baseSalaryRates.some((r) => r.mode === "VARIABLE");
  const fixedRanges = baseSalaryRates
    .filter((r) => r.mode === "FIXED")
    .map((r) => ({
      from: format(r.effectiveFrom, "yyyy-MM"),
      to: r.effectiveTo ? format(r.effectiveTo, "yyyy-MM") : null,
    }));

  // Grafik zaman ekseninde soldan sağa okunur; tablo en yeni ay üstte
  // olacak şekilde sıralı olduğu için burada ters çevrilir.
  const chronological = [...results].reverse();

  const holidayDateKeys = new Set(holidays.map((h) => toDateKey(h.date)));
  const dayExceptions = new Map(
    dayExceptionRows.map((e) => [toDateKey(e.date), e.dayType])
  );
  // Takvim ayı istemcide kuruyor; sunucudan yalnızca ham veri gidiyor.
  // Önceden burada her ay için hazır takvim üretiliyordu ve liste maaş
  // sonucu olan aylarla sınırlıydı: hiç gün işaretlememiş kullanıcı takvimi
  // hiç göremiyor, dolayısıyla ilk günü de işaretleyemiyordu.
  const markedDays: [string, (typeof dayExceptionRows)[number]["dayType"]][] =
    dayExceptionRows.map((e) => [toDateKey(e.date), e.dayType]);
  const adjustments = Object.fromEntries(
    results
      .filter((r) => r.mode === "VARIABLE")
      .map((r) => [
        r.month,
        (r.breakdown as { monthLengthAdjustment?: number } | null)
          ?.monthLengthAdjustment ?? 0,
      ])
  );

  /*
   * Karışık para birimi tek eksende karşılaştırılamaz, biri dışarıda kalmak
   * zorunda. Ölçü olarak EN SON ayın para birimi seçiliyor: maaş türü dönem
   * bazlı olduğundan işini değiştiren biri para birimi de değiştiriyor ve
   * ilk kaydınkine göre seçmek, grafiği sonsuza dek eski işin para
   * biriminde bırakıyordu.
   */
  const salaryCurrency =
    chronological[chronological.length - 1]?.currency ?? "USD";
  const trendExcluded = chronological.filter(
    (r) => r.currency !== salaryCurrency
  ).length;
  const trend: SalaryPoint[] = chronological
    .filter((r) => r.currency === salaryCurrency)
    .map((r) => ({
      month: r.month,
      hesaplanan: Number(r.total),
      gerçekleşen: r.actualAmount === null ? null : Number(r.actualAmount),
    }));

  const today = format(new Date(), "yyyy-MM-dd");
  const thisMonth = today.slice(0, 7);

  const resultRows = results.map((r) => ({
    id: r.id,
    month: r.month,
    mode: r.mode,
    currency: r.currency,
    total: r.total.toString(),
    monthLengthAdjustment:
      (r.breakdown as { monthLengthAdjustment?: number } | null)
        ?.monthLengthAdjustment ?? 0,
    actualAmount: r.actualAmount?.toString() ?? null,
    avgUsdTryRate: r.avgUsdTryRate?.toString() ?? null,
    fxRateMonth: r.fxRateMonth,
  }));

  /*
   * Kutular İÇİNDE BULUNULAN ayı gösterir, en son hesaplanan ayı değil.
   * İkisi çoğu zaman aynı ama ay başında ayrılıyorlar: eylülün 2'sinde
   * "en son hesaplanan" hâlâ ağustos oluyor ve kutular geçen ayın maaşını
   * bu ayınmış gibi gösteriyordu.
   *
   * Bu ay henüz hesaplanmadıysa kutu boş kalmaz, durumu söyler.
   */
  const current = resultRows.find((r) => r.month === thisMonth) ?? null;
  const latest = current ?? resultRows[0] ?? null;
  const showingFallback = current === null && latest !== null;
  // Kutudaki "Çalışılan gün" için tek ay yeter; takvimin kendi ayı ayrı.
  const latestCalendar =
    latest?.mode === "VARIABLE"
      ? buildMonthCalendar({
          month: latest.month,
          periods: [],
          holidayDateKeys,
          dayExceptions,
        })
      : null;
  // Maaş hak edildiği ayda değil, ödendiği ayda elimize geçiyor.
  const paymentMonth = latest
    ? shiftMonthKey(latest.month, user.salaryPaymentMonthOffset)
    : null;
  const latestRate = latest?.avgUsdTryRate ? Number(latest.avgUsdTryRate) : null;
  /*
   * TL karşılığı, gerçekleşen ödeme girilmişse ONUN üzerinden hesaplanır —
   * tablodaki sütunla aynı taban. Kutu hesaplanandan, tablo gerçekleşenden
   * yazdığında aynı ekranda iki farklı TL rakamı görünüyordu.
   */
  const latestBasis =
    latest === null ? null : Number(latest.actualAmount ?? latest.total);
  const latestTry =
    latestBasis === null
      ? null
      : latest!.currency === "TRY"
        ? latestBasis
        : latestRate === null
          ? null
          : latestBasis * latestRate;
  /*
   * "Çalışılan gün" yalnızca DEĞİŞKEN bir ayda anlamlı. Sabit ayda gün
   * sayısı tutara girmiyor; karışık geçmişte kutuya sayı yazmak, sabit ayın
   * maaşı gün sayısından geliyormuş gibi okunurdu.
   */
  const workedDays = latestCalendar ? latestCalendar.counts.NORMAL : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
            Maaş
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Her ay, o ayı kapsayan baz maaş döneminin türüyle hesaplanır —
            gün bazlı ya da sabit. Türü Maaş ayarları&apos;ndan dönem dönem
            seçersin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/salary/settings"
            className="text-accent-text text-[13px] font-semibold underline underline-offset-4"
          >
            Maaş ayarları
          </Link>
        </div>
      </header>

      {recomputeFailures.length > 0 && (
        <div className="border-destructive bg-accent text-accent-foreground border px-4 py-3">
          <p className="text-[14px] font-extrabold">
            Bazı aylar otomatik hesaplanamadı
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px]">
            {recomputeFailures.map((f) => (
              <li key={f.month}>
                <strong>{f.month}:</strong> {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {baseSalaryRates.length === 0 && (
        <div className="border-destructive bg-accent text-accent-foreground border px-4 py-3">
          <p className="text-[14px] font-extrabold">Baz maaş tanımlı değil</p>
          <p className="mt-1 text-[13px]">
            Otomatik hesaplama için önce{" "}
            <Link href="/salary/settings" className="underline">
              Maaş ayarları
            </Link>{" "}
            sayfasından bir baz maaş dönemi ekle.
          </p>
        </div>
      )}

      {latest && (
        <StatStrip>
          <Stat
            label={`${formatMonth(latest.month)} brüt`}
            value={formatMoney(latest.total, latest.currency)}
            caption={
              showingFallback
                ? `${formatMonth(thisMonth)} henüz hesaplanmadı`
                : latest.mode === "FIXED"
                  ? "sabit dönem"
                  : "gün bazlı"
            }
          />
          <Stat
            label="TRY karşılığı"
            value={latestTry === null ? "—" : formatMoney(latestTry, "TRY")}
            caption={
              latestRate === null
                ? "kur verisi yok"
                : `${latest.actualAmount !== null ? "gerçekleşenden" : "hesaplanandan"} · TCMB ${latest.fxRateMonth ?? latest.month} ortalaması`
            }
          />
          <Stat
            label="Çalışılan gün"
            value={workedDays === null ? "—" : String(workedDays)}
            caption={
              // Sabit ayda gün sayısı tutara girmiyor; "normal gün sayısı"
              // yazmak, boş kutuyu eksik veri gibi gösterirdi.
              latestCalendar === null
                ? "sabit ay — gün sayılmaz"
                : latestCalendar.uncovered.length > 0
                  ? `${latestCalendar.uncovered.length} gün işaretsiz`
                  : "normal gün sayısı"
            }
            info={
              <CalcInfo title="Çalışılan gün nasıl sayılır">
                <p>
                  Takvimde <strong>normal gün</strong> olarak sınıflanan
                  günlerin sayısı. Pazar, resmi tatil ve izin günleri ayrı
                  sayılır ve maaşa kendi katsayılarıyla girer.
                </p>
                <p>
                  Yalnızca <strong>değişken</strong> aylarda dolu: sabit bir
                  dönemde maaş gün sayısından değil, döneme girdiğin tutardan
                  gelir.
                </p>
                <p>
                  Bordro ayı 30 gün saydığı için hesaba giren gün sayısı
                  takvimdekinden farklı olabilir; fark tablodaki satırda
                  &quot;(+1 gün)&quot; gibi gösterilir.
                </p>
              </CalcInfo>
            }
          />
          <Stat
            label="Ödeme ayı"
            value={paymentMonth ? formatMonth(paymentMonth) : "—"}
            caption={
              user.salaryPaymentMonthOffset === 0
                ? "hak edildiği ay ödeniyor"
                : `${user.salaryPaymentMonthOffset} ay gecikmeli`
            }
          />
        </StatStrip>
      )}

      {/*
        Solda tablolar ALT ALTA ve tek sütun genişliğinde, sağda takvim kendi
        sütununda. Takvim tek veri girişi olduğu için dar ekranda ÖNCE o
        geliyor: aksi halde kullanıcı gün işaretlemek için henüz doldurmadığı
        tablonun altına inmek zorunda kalıyordu. Dönem tablosu kalkınca sol
        sütun hafiflediğinden genişlik de takvime kaydı (420 → 460).
      */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-1">
          <section className="border-border border">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                Hesaplanan / gerçekleşen
              </h2>
              <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                Bankaya yatan tutarı <strong>Gerçekleşen</strong> hücresine
                tıklayıp yaz. <strong>Fark</strong> tek para biriminde
                kalıyor: araya kur girseydi, eksik ödemeden mi kur
                hareketinden mi geldiği anlaşılmazdı.{" "}
                <strong>TRY karşılığı</strong> ise gerçekleşen girildiğinde
                onun üzerinden hesaplanır — cebe giren gerçek tutar o.
                {hasVariable &&
                  " Nominal USD toplamı takvimde işaretlenen günlerden bulunur, TCMB ortalama kuruyla düzeltilir."}
              </p>
            </header>
            <SalaryReconciliationTable results={resultRows} />
          </section>

          {trend.length >= 2 && (
            <section className="border-border border">
              <header className="border-border border-b-2 px-4 py-3">
                <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                  Maaş değişimi
                </h2>
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                  Aylık hesaplanan tutarın seyri ({salaryCurrency}). Gerçekleşen
                  ödeme girdiğin aylarda ikisi birlikte gösterilir.
                  {trendExcluded > 0 && (
                    <>
                      {" "}
                      Başka para birimindeki{" "}
                      <strong>{trendExcluded} ay</strong> grafiğe girmiyor:
                      iki para birimi tek eksende karşılaştırılamaz.
                    </>
                  )}
                </p>
              </header>
              <div className="p-4">
                <SalaryTrendChart data={trend} currency={salaryCurrency} />
              </div>
            </section>
          )}
        </div>

        {hasVariable && (
          <section className="border-border order-1 h-fit border xl:order-2">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                Çalışma takvimi
              </h2>
              <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                <strong>Değişken</strong> dönemlerde maaşın tek girişi burası.
                Günlere tıkla ya da sürükleyerek aralık seç, sonra{" "}
                <strong>Çalışıldı</strong> / <strong>İzin</strong> uygula; her gün sabit 7.5 saat normal +
                2.5 saat mesai sayılır, saat girişi yapılmaz. İşaretsiz günler
                kesikli çerçeveyle gösterilir ve maaşa hiç katılmaz. Değişiklik
                yaptığın aylar otomatik yeniden hesaplanır.
              </p>
            </header>
            <div className="p-4">
              <SalaryCalendarCard
                holidayDates={[...holidayDateKeys]}
                markedDays={markedDays}
                adjustments={adjustments}
                fixedRanges={fixedRanges}
                today={today}
                initialMonth={thisMonth}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** yyyy-MM'yi `offset` ay ileri taşır. */
function shiftMonthKey(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

"use client";

import { useMemo, useState } from "react";

import { CategoryPieChart } from "@/components/charts/CategoryPieChart";
import { MonthlyCategoryChart } from "@/components/charts/MonthlyCategoryChart";
import { lastMonths } from "@/lib/date/months";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { formatMoney, formatMonth } from "@/lib/format";

export type BreakdownEntry = {
  /** yyyy-MM-dd */
  date: string;
  categoryName: string;
  /**
   * Baz para birimine çevrilmiş tutar. Çevrim, kaydın ait olduğu ayın TCMB
   * ortalama kuruyla sunucuda yapılır (bkz. lib/fx/monthlyBase). Eskiden
   * ham tutar geçiliyor ve grafik tek bir para birimini süzüyordu; farklı
   * para birimlerinde kayıt girenler dağılımın yalnızca bir kısmını
   * görebiliyordu.
   */
  amount: number;
  /**
   * Kaydın geldiği yer (örn. "Kredi Kartı", "Genel Giderler", "Krediler").
   * Birden fazla kaynak varsa üstte seçilebilir filtre olarak görünür.
   * Tek kaynaklı listelerde (gelir sayfası) verilmesi gerekmez.
   */
  source?: string;
};

const ALL_MONTHS = "__all__";
const ALL_CATEGORIES = "__all_categories__";

/** Sütun grafiğinde bakılabilecek dönemler. */
const PERIODS = [6, 12, 24] as const;

/**
 * Gelir/gider kayıtlarının kategori dağılımı. Varsayılan olarak SON AY
 * gösterilir — tüm kayıtları kümülatif toplamak, eski aylar biriktikçe
 * dağılımı okunamaz hale getiriyor. Farklı para birimleri kur dönüşümü
 * olmadan toplanamayacağı için her biri ayrı düğmede.
 */
export function CategoryBreakdown({
  entries,
  baseCurrency,
}: {
  entries: BreakdownEntry[];
  /** Tüm tutarlar buna çevrilmiş olarak gelir. */
  baseCurrency: string;
}) {
  const months = useMemo(() => {
    const set = new Set(entries.map((e) => e.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [entries]);

  // Kaynak sırası veri sırasını izler; alfabetik sıralamak "Genel Giderler"i
  // başa alıp sekmelerin sırasıyla çelişirdi.
  const sources = useMemo(() => {
    const seen: string[] = [];
    for (const e of entries) {
      if (e.source && !seen.includes(e.source)) seen.push(e.source);
    }
    return seen;
  }, [entries]);

  const [month, setMonth] = useState<string>(() => months[0] ?? ALL_MONTHS);
  /** Kapatılan kaynaklar. Varsayılan: hepsi açık. */
  const [hiddenSources, setHiddenSources] = useState<string[]>([]);
  /**
   * Pasta "bu ay parayı neye verdim", sütun ise "bu kaleme aylar içinde ne
   * kadar veriyorum" sorusunu cevaplar. Kaynak filtresi iki görünümde de
   * ortaktır.
   */
  const [view, setView] = useState<"pie" | "bar">("pie");
  const [barCategory, setBarCategory] = useState<string>(ALL_CATEGORIES);
  const [periodMonths, setPeriodMonths] = useState<number>(12);

  // Ay filtresi dışındaki ortak süzgeç. Sütun görünümü aylara yayıldığı için
  // tek bir ayla sınırlanamaz.
  const scoped = useMemo(
    () =>
      entries.filter((e) => !(e.source && hiddenSources.includes(e.source))),
    [entries, hiddenSources]
  );

  const filtered = useMemo(
    () =>
      scoped.filter(
        (e) => month === ALL_MONTHS || e.date.slice(0, 7) === month
      ),
    [scoped, month]
  );

  /** Sütun görünümünde seçilebilecek kalemler; süzgeçten sonra kalanlar. */
  const barCategories = useMemo(() => {
    const set = new Set(scoped.map((e) => e.categoryName));
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [scoped]);

  const monthlySeries = useMemo(() => {
    // Pencere, veride bulunan en son aya göre kurulur; "bugün"e bağlamak
    // sunucu/istemci arasında farklı sonuç verebilirdi.
    const latest = months[0];
    if (!latest) return [];

    const window = lastMonths(latest, periodMonths);
    const totals = new Map(window.map((m) => [m, 0]));

    for (const e of scoped) {
      if (barCategory !== ALL_CATEGORIES && e.categoryName !== barCategory) {
        continue;
      }
      const m = e.date.slice(0, 7);
      if (!totals.has(m)) continue;
      totals.set(m, (totals.get(m) ?? 0) + e.amount);
    }

    return window.map((m) => ({ month: m, value: totals.get(m) ?? 0 }));
  }, [scoped, months, periodMonths, barCategory]);

  const slices = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of filtered) {
      totals.set(e.categoryName, (totals.get(e.categoryName) ?? 0) + e.amount);
    }
    return [...totals.entries()].map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz kayıt yok.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {view === "pie" ? (
          <>
            <div className="grid w-full gap-1.5 sm:w-auto">
              <label className="text-sm font-medium" htmlFor="breakdown-month">
                Ay
              </label>
              <Input
                id="breakdown-month"
                type="month"
                value={month === ALL_MONTHS ? "" : month}
                onChange={(e) => setMonth(e.target.value || ALL_MONTHS)}
                className="w-full sm:w-40"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant={month === ALL_MONTHS ? "default" : "outline"}
              onClick={() => setMonth(ALL_MONTHS)}
            >
              Tüm zamanlar
            </Button>
            {months.slice(0, 3).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={month === m ? "default" : "outline"}
                onClick={() => setMonth(m)}
              >
                {formatMonth(m)}
              </Button>
            ))}
          </>
        ) : (
          <>
            <div className="grid w-full gap-1.5 sm:w-auto">
              <label className="text-sm font-medium" htmlFor="breakdown-category">
                Kalem
              </label>
              <select
                id="breakdown-category"
                value={barCategory}
                onChange={(e) => setBarCategory(e.target.value)}
                className="border-input bg-muted h-9 w-full border px-2 text-sm sm:w-56"
              >
                <option value={ALL_CATEGORIES}>Tümü</option>
                {barCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1.5">
              {PERIODS.map((count) => (
                <Button
                  key={count}
                  type="button"
                  size="sm"
                  variant={periodMonths === count ? "default" : "outline"}
                  onClick={() => setPeriodMonths(count)}
                >
                  {count} ay
                </Button>
              ))}
            </div>
          </>
        )}

        {/* Grafik türü geniş ekranda sağ üstte. Telefonda `ml-auto` grubu
            sarma sonrası kendi satırında sağa yapıştırıp solunda boşluk
            bırakıyordu; dar ekranda akışta kalıyor. */}
        <div className="flex gap-1.5 sm:ml-auto">
          <Button
            type="button"
            size="sm"
            variant={view === "pie" ? "default" : "outline"}
            aria-pressed={view === "pie"}
            onClick={() => setView("pie")}
          >
            Pasta
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "bar" ? "default" : "outline"}
            aria-pressed={view === "bar"}
            onClick={() => setView("bar")}
          >
            Sütun
          </Button>
        </div>
      </div>

      {sources.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs">Kaynak:</span>
          {sources.map((source) => {
            const active = !hiddenSources.includes(source);
            return (
              // Bu grup ÇOKLU seçim: iki kaynak da açık olabilir. Dolu
              // kırmızı, sayfadaki tek-seçimli segmentlerin dili — burada
              // kullanıldığında iki bitişik kırmızı düğme "ikisi birden
              // seçili" yerine "hangisi seçili?" sorusu doğuruyordu.
              // Kutucuk seçimi doğrudan gösteriyor.
              <button
                key={source}
                type="button"
                aria-pressed={active}
                className={cn(
                  "border-border flex min-h-11 items-center gap-1.5 border px-2.5 text-[13px] font-semibold sm:min-h-8",
                  active ? "bg-muted" : "text-muted-foreground"
                )}
                onClick={() =>
                  setHiddenSources((current) =>
                    current.includes(source)
                      ? current.filter((s) => s !== source)
                      : // Son açık kaynağı da kapatmak boş grafik bırakırdı.
                        current.length === sources.length - 1
                        ? current
                        : [...current, source]
                  )
                }
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-3.5 flex-none items-center justify-center border text-[10px] leading-none",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border"
                  )}
                >
                  {active ? "✓" : ""}
                </span>
                {source}
              </button>
            );
          })}
        </div>
      )}

      {view === "pie" ? (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">
              {month === ALL_MONTHS ? "Tüm zamanlar" : formatMonth(month)} toplamı:{" "}
            </span>
            <span className="font-medium">{formatMoney(total, baseCurrency)}</span>
          </p>

          <CategoryPieChart
            slices={slices}
            currency={baseCurrency}
            emptyMessage="Bu ay ve para biriminde kayıt yok."
          />
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {barCategory === ALL_CATEGORIES
              ? "Seçili kaynakların aylık toplamı"
              : barCategory}{" "}
            — son {periodMonths} ay
          </p>

          <MonthlyCategoryChart data={monthlySeries} currency={baseCurrency} />
        </>
      )}
    </div>
  );
}

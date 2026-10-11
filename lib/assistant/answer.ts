import Decimal from "decimal.js";

import { toDateKeyUtc, toMonthKeyUtc } from "@/lib/date/utc";

import type { Metric, ParsedQuestion } from "./parseQuestion";

/**
 * Çözümlenmiş soruyu veriyle cevaplar.
 *
 * Saf fonksiyon: veritabanına da kura da dokunmuyor, hepsi çağıran
 * tarafından hazırlanıp veriliyor. Böylece "ayın 13'ünden beri ne kadar
 * harcadım" sorusunun cevabı tek tek test edilebiliyor.
 */

export type AnswerEntry = {
  /** yyyy-MM-dd */
  date: string;
  categoryName: string;
  /** Baz para birimine çevrilmiş tutar. */
  amountInBase: Decimal;
  frequency: "ONE_TIME" | "MONTHLY";
  /** yyyy-MM, tekrarlayan kaydın son ayı. */
  recurrenceEndMonth?: string | null;
};

export type ReportLine = { categoryName: string; amount: Decimal; share: number };

export type Report = {
  metric: Metric;
  from: string;
  to: string;
  rangeLabel: string;
  categoryQuery: string | null;
  /** Gider toplamı (metric ne olursa olsun hesaplanır). */
  expenseTotal: Decimal;
  incomeTotal: Decimal;
  /** Sorulan ölçünün cevabı. */
  total: Decimal;
  /** Kategori dökümü, büyükten küçüğe. */
  lines: ReportLine[];
  /** Aralığa düşen kayıt sayısı. */
  count: number;
  /** Aralıktaki gün sayısı; günlük ortalama için. */
  dayCount: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function gunSayisi(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / MS_PER_DAY) + 1);
}

/**
 * Tekrarlayan bir kaydın verilen aralığa düşen tekrar tarihleri.
 *
 * Kayıt, girildiği günün AYIN KAÇI olduğuna demirleniyor: 1 Mayıs'ta
 * girilen kira her ayın 1'inde tekrar ediyor. Gün bazlı bir aralıkta
 * "ayın 13'ünden beri" diye sorulduğunda ayın 1'indeki kiranın sayılmaması
 * gerekiyor; ayı bütün olarak saymak bu soruya yanlış cevap verirdi.
 *
 * O ayda olmayan güne (31 Şubat) denk gelirse ayın son gününe kırpılıyor —
 * tekrarın büsbütün kaybolması, bir ay kira ödenmemiş gibi görünürdü.
 */
function tekrarTarihleri(
  entry: AnswerEntry,
  from: string,
  to: string
): string[] {
  const anchor = new Date(`${entry.date}T00:00:00Z`);
  const anchorDay = anchor.getUTCDate();
  const sonu = entry.recurrenceEndMonth ?? null;

  const out: string[] = [];
  const bas = new Date(`${from}T00:00:00Z`);
  const bit = new Date(`${to}T00:00:00Z`);

  let yil = bas.getUTCFullYear();
  let ay = bas.getUTCMonth();

  // Aralık en fazla birkaç yıl; üst sınır bozuk veride sonsuz döngüyü keser.
  for (let i = 0; i < 400; i++) {
    const ayAnahtari = `${yil}-${String(ay + 1).padStart(2, "0")}`;
    const ayinSonu = new Date(Date.UTC(yil, ay + 1, 0)).getUTCDate();
    const gun = Math.min(anchorDay, ayinSonu);
    const tarih = new Date(Date.UTC(yil, ay, gun));

    if (tarih > bit) break;

    const baslamisMi = tarih >= anchor;
    const bitmemisMi = !sonu || ayAnahtari <= sonu;
    if (tarih >= bas && baslamisMi && bitmemisMi) {
      out.push(toDateKeyUtc(tarih));
    }

    ay += 1;
    if (ay > 11) {
      ay = 0;
      yil += 1;
    }
  }

  return out;
}

/** Kaydın aralığa düşen tekrar sayısı (tek seferlikte 0 ya da 1). */
export function occurrencesInRange(
  entry: AnswerEntry,
  from: string,
  to: string
): string[] {
  if (entry.frequency === "ONE_TIME") {
    return entry.date >= from && entry.date <= to ? [entry.date] : [];
  }
  return tekrarTarihleri(entry, from, to);
}

function topla(
  entries: AnswerEntry[],
  from: string,
  to: string,
  categoryQuery: string | null
): { total: Decimal; lines: ReportLine[]; count: number } {
  const byCategory = new Map<string, Decimal>();
  let total = new Decimal(0);
  let count = 0;

  for (const e of entries) {
    if (categoryQuery && e.categoryName !== categoryQuery) continue;
    const kere = occurrencesInRange(e, from, to);
    if (kere.length === 0) continue;

    const tutar = e.amountInBase.mul(kere.length);
    total = total.plus(tutar);
    count += kere.length;
    byCategory.set(
      e.categoryName,
      (byCategory.get(e.categoryName) ?? new Decimal(0)).plus(tutar)
    );
  }

  const lines = [...byCategory.entries()]
    .map(([categoryName, amount]) => ({
      categoryName,
      amount,
      share: total.isZero() ? 0 : amount.div(total).mul(100).toNumber(),
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));

  return { total, lines, count };
}

export function answerQuestion({
  question,
  expenses,
  incomes,
}: {
  question: ParsedQuestion;
  expenses: AnswerEntry[];
  incomes: AnswerEntry[];
}): Report {
  const { from, to, metric, categoryQuery } = question;

  const gider = topla(expenses, from, to, categoryQuery);
  // Kategori filtresi gider tarafı için sorulur ("markete ne harcadım");
  // gelire uygulamak toplamı sessizce sıfırlardı.
  const gelir = topla(incomes, from, to, metric === "income" ? categoryQuery : null);

  const secili =
    metric === "expense" ? gider : metric === "income" ? gelir : null;

  return {
    metric,
    from,
    to,
    rangeLabel: question.rangeLabel,
    categoryQuery,
    expenseTotal: gider.total,
    incomeTotal: gelir.total,
    total: secili ? secili.total : gelir.total.minus(gider.total),
    lines: secili ? secili.lines : gider.lines,
    count: secili ? secili.count : gider.count + gelir.count,
    dayCount: gunSayisi(from, to),
  };
}

/** Ay anahtarını dışarıya da açıyoruz; çağıran kur çevirisinde kullanıyor. */
export { toMonthKeyUtc };

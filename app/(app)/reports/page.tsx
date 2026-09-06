import Decimal from "decimal.js";
import { addMonths, format, parse, subMonths } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMonthlyBaseConverter } from "@/lib/fx/monthlyBase";
import { monthlyTotals } from "@/lib/cashflow/monthlyTotals";
import { appliesToMonth } from "@/lib/cashflow/calculations";
import { formatMoneyWhole, formatMonth } from "@/lib/format";
import { MetricChart } from "./metric-chart";
import { RangeFilters } from "./range-filters";
import type { SerializedMonth } from "./serialize";
import { ShareList } from "@/components/money/share-list";

const MAX_MONTHS = 24;

function monthRange(from: string, to: string): string[] {
  const start = parse(from, "yyyy-MM", new Date());
  const end = parse(to, "yyyy-MM", new Date());
  const [a, b] = start <= end ? [start, end] : [end, start];

  const months: string[] = [];
  let cursor = a;
  while (cursor <= b && months.length < MAX_MONTHS) {
    months.push(format(cursor, "yyyy-MM"));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export default async function ReportsPage({
  searchParams,
}: PageProps<"/reports">) {
  const params = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const from =
    typeof params.from === "string" && /^\d{4}-\d{2}$/.test(params.from)
      ? params.from
      : format(subMonths(now, 11), "yyyy-MM");
  const to =
    typeof params.to === "string" && /^\d{4}-\d{2}$/.test(params.to)
      ? params.to
      : currentMonth;
  const months = monthRange(from, to);

  const [
    user,
    incomeEntries,
    expenses,
    loans,
    salaryResults,
    investments,
    cardPayments,
  ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { baseCurrency: true, salaryPaymentMonthOffset: true },
      }),
      prisma.incomeEntry.findMany({ where: { userId } }),
      prisma.expense.findMany({
        where: { userId },
        include: { category: true },
      }),
      prisma.loan.findMany({
        where: { userId },
        include: { periods: { orderBy: { effectiveFrom: "asc" } } },
      }),
      prisma.monthlySalaryResult.findMany({ where: { userId } }),
      prisma.investmentTransaction.findMany({ where: { userId } }),
      prisma.creditCardStatementPayment.findMany({ where: { userId } }),
    ]);

  const baseCurrency = user.baseCurrency;
  const toBase = await createMonthlyBaseConverter({ months, baseCurrency });

  const totals = monthlyTotals({
    months,
    incomeEntries: incomeEntries.map((e) => ({
      date: e.date,
      frequency: e.frequency,
      amount: e.amount.toString(),
      currency: e.currency,
    })),
    expenses: expenses.map((e) => ({
      date: e.date,
      frequency: e.frequency,
      amount: e.amount.toString(),
      currency: e.currency,
      kind: e.kind,
      paymentMonth: e.paymentMonth,
      installmentCount: e.installmentCount,
    })),
    loans: loans.map((l) => ({
      id: l.id,
      name: l.name,
      currency: l.currency,
      startMonth: l.startMonth,
      endMonth: l.endMonth,
      periods: l.periods.map((p) => ({
        effectiveFrom: p.effectiveFrom,
        amount: p.amount.toString(),
      })),
    })),
    salaryByAccrualMonth: new Map(
      salaryResults.map((r) => [
        r.month,
        {
          amount: (r.actualAmount ?? r.total).toString(),
          currency: r.currency,
        },
      ])
    ),
    salaryOffset: user.salaryPaymentMonthOffset,
    // Kart tarafında cepten çıkan, ekstrenin kendisi değil ÖDENEN tutar.
    cardPayments: cardPayments.map((p) => ({
      month: p.month,
      amount: p.amount.toString(),
      currency: p.currency,
    })),
    // Genel Bakış ile aynı taban: yatırım da nakit hareketi.
    investments: investments.map((t) => ({
      symbol: t.symbol,
      assetType: t.assetType,
      side: t.side,
      quantity: new Decimal(t.quantity.toString()),
      pricePerUnit: new Decimal(t.pricePerUnit.toString()),
      currency: t.currency,
      tradedAt: t.tradedAt,
      createdAt: t.createdAt,
      isOpening: t.isOpening,
      proceedsWithdrawn: t.proceedsWithdrawn,
    })),
    toBase,
  });

  const serialized: SerializedMonth[] = totals.map((t) => ({
    month: t.month,
    income: t.income.toFixed(2),
    expenses: t.expenses.toFixed(2),
  }));

  /*
   * Kategori toplamı, aylık toplamlardan FARKLI bir taban kullanıyor:
   * harcamanın yapıldığı tarih. "Bu dönemde markete ne kadar verdim"
   * sorusu kartın ne zaman ödendiğine bakmaz. Grafikteki gider toplamıyla
   * birebir tutmaması bu yüzden beklenen; kartın altında yazıyor.
   */
  const byCategory = new Map<string, Decimal>();
  for (const expense of expenses) {
    const month = format(expense.date, "yyyy-MM");
    const inRange =
      expense.frequency === "MONTHLY"
        ? months.some((m) => appliesToMonth(expense, m))
        : months.includes(month);
    if (!inRange) continue;

    // Aylık tekrarlayan kayıt aralıktaki her ay için ayrı sayılır.
    const occurrences =
      expense.frequency === "MONTHLY"
        ? months.filter((m) => appliesToMonth(expense, m))
        : [month];

    for (const m of occurrences) {
      const amount = toBase(
        new Decimal(expense.amount.toString()),
        expense.currency,
        m
      );
      byCategory.set(
        expense.category.name,
        (byCategory.get(expense.category.name) ?? new Decimal(0)).plus(amount)
      );
    }
  }

  const categoryRows = [...byCategory]
    .map(([name, amount]) => ({ name, amount: amount.toNumber() }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const highlights = buildHighlights(totals, baseCurrency);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
            Raporlar
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            {formatMonth(from)} — {formatMonth(to)} · {months.length} ay
          </p>
        </div>
        <RangeFilters from={from} to={to} />
      </header>

      <section className="border-border border p-4">
        <MetricChart months={serialized} currency={baseCurrency} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="border-border border">
          <header className="border-border border-b-2 px-4 py-3">
            <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
              Kategoriye göre {months.length} ay toplamı
            </h2>
            <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
              Harcamanın <strong>yapıldığı tarihe</strong> göre — kartın ne
              zaman ödendiğine bakmaz. Bu yüzden yukarıdaki gider toplamıyla
              birebir tutmayabilir; o, paranın cepten çıktığı ayı kullanıyor.
            </p>
          </header>
          {categoryRows.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-[13px]">
              Bu aralıkta harcama kaydı yok.
            </p>
          ) : (
            <ShareList rows={categoryRows} currency={baseCurrency} />
          )}
        </section>

        <section className="border-border h-fit border">
          <header className="border-border border-b-2 px-4 py-3">
            <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
              Öne çıkanlar
            </h2>
            <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
              Seçili aralıktan çıkan gözlemler.
            </p>
          </header>
          {highlights.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-[13px]">
              Gözlem çıkarmak için en az iki aylık veri gerekiyor.
            </p>
          ) : (
            <ul className="divide-hairline">
              {highlights.map((h) => (
                <li key={h.title} className="px-4 py-3">
                  <p className="text-[14px] font-semibold">{h.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                    {h.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

type Highlight = { title: string; detail: string };

/**
 * Anlatı kutuları — simge yok, tek cümlelik açıklama var.
 *
 * Yalnızca VERİYE DAYANAN gözlemler üretiliyor; "harcamalarını azalt" gibi
 * öğüt yok. Hesaplanamayan bir gözlem hiç yazılmıyor: yer doldurmak için
 * "veri yetersiz" kutusu koymak, kartı gürültüye çeviriyordu.
 */
function buildHighlights(
  totals: { month: string; income: Decimal; expenses: Decimal }[],
  currency: string
): Highlight[] {
  const withData = totals.filter(
    (t) => !t.income.isZero() || !t.expenses.isZero()
  );
  if (withData.length < 2) return [];

  const out: Highlight[] = [];

  const priciest = withData.reduce((a, b) =>
    b.expenses.greaterThan(a.expenses) ? b : a
  );
  out.push({
    title: `En yüksek giderli ay: ${formatMonth(priciest.month)}`,
    detail: `${formatMoneyWhole(priciest.expenses.toNumber(), currency)} harcandı — aralıktaki ${withData.length} ay içinde en yükseği.`,
  });

  const best = withData.reduce((a, b) =>
    b.income.minus(b.expenses).greaterThan(a.income.minus(a.expenses)) ? b : a
  );
  const bestNet = best.income.minus(best.expenses);
  out.push({
    title: `En iyi ay: ${formatMonth(best.month)}`,
    detail:
      bestNet.isNegative()
        ? `Net ${formatMoneyWhole(bestNet.toNumber(), currency)} — aralıktaki bütün aylar açık verdi.`
        : `Net ${formatMoneyWhole(bestNet.toNumber(), currency)} kaldı.`,
  });

  const deficits = withData.filter((t) => t.expenses.greaterThan(t.income));
  if (deficits.length > 0) {
    out.push({
      title: `${deficits.length} ay açık verdi`,
      detail: `${withData.length} ayın ${deficits.length} tanesinde gider geliri aştı: ${deficits.map((d) => formatMonth(d.month)).join(", ")}.`,
    });
  }

  const totalIncome = withData.reduce((a, t) => a.plus(t.income), new Decimal(0));
  const totalExpenses = withData.reduce(
    (a, t) => a.plus(t.expenses),
    new Decimal(0)
  );
  if (!totalIncome.isZero()) {
    const rate = totalIncome
      .minus(totalExpenses)
      .div(totalIncome)
      .times(100)
      .toNumber();
    out.push({
      title: `Dönem tasarruf oranı %${rate.toFixed(1)}`,
      detail: `${formatMoneyWhole(totalIncome.toNumber(), currency)} gelire karşı ${formatMoneyWhole(totalExpenses.toNumber(), currency)} gider.`,
    });
  }

  return out;
}

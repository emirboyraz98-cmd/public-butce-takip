import Decimal from "decimal.js";
import Link from "next/link";
import { format } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMonthlyBaseConverter } from "@/lib/fx/monthlyBase";
import { summarizeBudgets } from "@/lib/budget/calculations";
import { appliesToMonth } from "@/lib/cashflow/calculations";
import { formatMoneyWhole, formatMonth } from "@/lib/format";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { CalcInfo } from "@/components/ui/calc-info";
import { BudgetRows, type BudgetRow } from "./budget-rows";
import { MonthPicker } from "./month-picker";

export default async function BudgetsPage({
  searchParams,
}: PageProps<"/budgets">) {
  const params = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const month =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth;

  const [user, categories, expenses] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true },
    }),
    prisma.expenseCategory.findMany({
      where: { userId, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.expense.findMany({ where: { userId }, include: { category: true } }),
  ]);

  const baseCurrency = user.baseCurrency;
  const toBase = await createMonthlyBaseConverter({
    months: [month],
    baseCurrency,
  });

  /*
   * Bütçe HARCAMA tarihini kullanır, ödeme ayını değil.
   *
   * "Bu ay markete ne kadar verdim" sorusu kartın ne zaman ödendiğine
   * bakmaz; taksitli bir alışveriş de alındığı ayın bütçesine tam tutarıyla
   * girer. Nakit akışı (Genel Bakış) tam tersini yapar ve ödeme ayını
   * kullanır — ikisi farklı soruları yanıtlıyor.
   */
  const spentByCategory = new Map<string, Decimal>();
  for (const expense of expenses) {
    // Tek seferlik kayıt kendi ayında, aylık tekrarlayan kayıt başladığı
    // aydan itibaren her ay sayılır — nakit akışıyla aynı kural.
    if (!appliesToMonth(expense, month)) continue;

    const amount = toBase(
      new Decimal(expense.amount.toString()),
      expense.currency,
      month
    );
    spentByCategory.set(
      expense.categoryId,
      (spentByCategory.get(expense.categoryId) ?? new Decimal(0)).plus(amount)
    );
  }

  const summary = summarizeBudgets(
    categories.map((c) => ({
      categoryId: c.id,
      name: c.name,
      limit: c.monthlyLimit === null ? null : new Decimal(c.monthlyLimit.toString()),
      spent: spentByCategory.get(c.id) ?? new Decimal(0),
    }))
  );

  const rows: BudgetRow[] = summary.rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    limit: r.limit === null ? null : r.limit.toFixed(2),
    spent: r.spent.toFixed(2),
    percent: r.percent,
    overage: r.overage.toFixed(2),
    remaining: r.remaining.toFixed(2),
  }));

  const overspent = summary.totalRemaining.isNegative();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
            Bütçeler
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Kategori başına aylık sınır ve o ayın gerçekleşmesi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MonthPicker month={month} />
          <Link
            href="/expenses/categories"
            className="text-accent-text text-[13px] font-semibold underline underline-offset-4"
          >
            Kategorileri yönet
          </Link>
        </div>
      </header>

      <StatStrip columns={3}>
        <Stat
          label={`${formatMonth(month)} bütçesi`}
          value={formatMoneyWhole(summary.totalLimit.toNumber(), baseCurrency)}
          caption={`${rows.filter((r) => r.limit !== null).length} kategoride sınır var`}
          info={
            <CalcInfo title="Aylık bütçe nasıl toplanır">
              <p>
                Yalnızca <strong>sınır konmuş</strong> kategorilerin sınırları
                toplanır. Sınırsız kategorilerin harcaması bu sayfadaki hiçbir
                toplama girmez — girseydi &quot;bütçenin %140&apos;ı
                kullanıldı&quot; gibi hiçbir sınıra dayanmayan bir oran
                çıkardı.
              </p>
            </CalcInfo>
          }
        />
        <Stat
          label="Harcanan"
          value={formatMoneyWhole(summary.totalSpent.toNumber(), baseCurrency)}
          caption={
            summary.overCount > 0
              ? `${summary.overCount} kategori sınırı aştı`
              : "sınır aşan kategori yok"
          }
          info={
            <CalcInfo title="Harcanan nasıl hesaplanır">
              <p>
                Harcamanın <strong>yapıldığı tarihe</strong> göre sayılır,
                ödendiği aya göre değil: kartla alınan taksitli bir ürün,
                alındığı ayın bütçesine tutarının tamamıyla girer.
              </p>
              <p>
                Genel Bakış&apos;taki nakit akışı tam tersini yapar ve ödeme
                ayını kullanır; ikisi farklı soruları yanıtlıyor.
              </p>
            </CalcInfo>
          }
        />
        <Stat
          label={overspent ? "Aşım" : "Kalan"}
          value={formatMoneyWhole(
            Math.abs(summary.totalRemaining.toNumber()),
            baseCurrency
          )}
          tone={overspent ? "negative" : "default"}
          caption={
            summary.totalLimit.isZero()
              ? "henüz sınır konmadı"
              : // Ek almadan yazılıyor: "%91'ı" yanlış ("%91'i" olmalı) ve
                // doğru ek sayıya göre değişiyor (%20'si, %3'ü, %91'i).
                // Sayıyı ekten kurtarmak, her sayıda doğru kalmanın tek
                // güvenli yolu.
                `bütçe kullanımı: %${summary.totalSpent.div(summary.totalLimit).times(100).toFixed(0)}`
          }
        />
      </StatStrip>

      <section className="border-border border">
        <header className="border-border border-b-2 px-4 py-3">
          <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
            Kategori bütçeleri
          </h2>
          <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
            Tutarın üstüne tıklayıp sınırı yaz. Sınırı kaldırmak kategoriyi
            bütçe takibinden çıkarır; <strong>0</strong> yazmak ise geçerli bir
            hedef — &quot;bu kategoriye hiç harcama yapmayacağım&quot; demek.
          </p>
        </header>
        <BudgetRows rows={rows} currency={baseCurrency} />
      </section>
    </div>
  );
}

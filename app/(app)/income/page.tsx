import Link from "next/link";
import Decimal from "decimal.js";
import { format } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMonthlyBaseConverter } from "@/lib/fx/monthlyBase";
import { formatMoneyWhole } from "@/lib/format";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { CalcInfo } from "@/components/ui/calc-info";
import {
  CategoryBreakdown,
  type BreakdownEntry,
} from "@/components/money/category-breakdown";
import type { RecordRow } from "@/components/money/record-list";
import { IncomeList } from "./income-list";
import { Section } from "@/components/ui/section";

export default async function IncomePage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, categories, entries] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true },
    }),
    prisma.incomeCategory.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
    prisma.incomeEntry.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { date: "desc" },
    }),
  ]);

  // Farklı para birimleri kaydın ait olduğu ayın kuruyla baz para birimine
  // çevrilir. Eskiden grafik tek bir para birimini süzüyor, karışık girenler
  // resmin yalnızca bir kısmını görüyordu.
  const baseCurrency = user.baseCurrency;
  const toBase = await createMonthlyBaseConverter({
    months: entries.map((e) => format(e.date, "yyyy-MM")),
    baseCurrency,
  });

  const rows: RecordRow[] = entries.map((e) => {
    const date = format(e.date, "yyyy-MM-dd");
    const base = toBase(
      new Decimal(e.amount.toString()),
      e.currency,
      date.slice(0, 7)
    );
    return {
      id: e.id,
      date,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      amount: e.amount.toString(),
      currency: e.currency,
      frequency: e.frequency,
      note: e.note,
      baseAmount: base.toFixed(2),
      kind: "income",
    };
  });

  const breakdownEntries: BreakdownEntry[] = rows.map((row) => ({
    date: row.date,
    categoryName: row.categoryName,
    amount: Number(row.baseAmount),
  }));

  const thisMonth = format(new Date(), "yyyy-MM");
  const monthTotal = rows
    .filter((r) => r.date.startsWith(thisMonth))
    .reduce((acc, r) => acc + Number(r.baseAmount), 0);
  const recurring = rows
    .filter((r) => r.frequency === "MONTHLY")
    .reduce((acc, r) => acc + Number(r.baseAmount), 0);
  const yearTotal = rows
    .filter((r) => r.date.startsWith(thisMonth.slice(0, 4)))
    .reduce((acc, r) => acc + Number(r.baseAmount), 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="t-display">
            Gelir
          </h1>
          <p className="t-body text-muted-foreground mt-1.5">
            Kira geliri, prim, kâr realizasyonu gibi maaş dışı gelirler.
          </p>
        </div>
        <Link
          href="/income/categories"
          className="text-accent-text text-[13px] font-semibold underline underline-offset-4"
        >
          Kategorileri yönet
        </Link>
      </header>

      <StatStrip columns={3}>
        <Stat
          label="Bu ay"
          value={formatMoneyWhole(monthTotal, baseCurrency)}
          caption="maaş hariç"
        />
        <Stat
          label="Aylık düzenli"
          value={formatMoneyWhole(recurring, baseCurrency)}
          caption="tekrarlayan kayıtların toplamı"
          info={
            <CalcInfo title="Aylık düzenli gelir nasıl hesaplanır">
              <p>
                Tekrar kipi <strong>aylık</strong> olan kayıtların toplamı.
                Bu kayıtlar başladıkları aydan itibaren her ay nakit akışına
                girer; tek seferlik kayıtlar buraya dahil değildir.
              </p>
            </CalcInfo>
          }
        />
        <Stat
          label={`${thisMonth.slice(0, 4)} toplamı`}
          value={formatMoneyWhole(yearTotal, baseCurrency)}
          caption={`${rows.filter((r) => r.date.startsWith(thisMonth.slice(0, 4))).length} kayıt`}
        />
      </StatStrip>

      <IncomeList
        rows={rows}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        baseCurrency={baseCurrency}
      />

      {breakdownEntries.length > 0 && (
        <Section
          title="Kategori dağılımı"
          summary="Maaş dışı gelirlerin kategori ağırlıkları."
          helpTitle="Dağılıma ne giriyor"
          help={
            <>
              <p>
                Maaş bu grafiğe dahil değildir; o Genel Bakış&apos;ta ayrı
                gösterilir.
              </p>
              <p>
                Farklı para birimindeki kayıtlar ait oldukları ayın TCMB
                ortalama kuruyla {baseCurrency}&apos;ye çevrilerek toplanır.
              </p>
            </>
          }
        >
          <div>
            <CategoryBreakdown
              entries={breakdownEntries}
              baseCurrency={baseCurrency}
            />
          </div>
        </Section>
      )}
    </div>
  );
}

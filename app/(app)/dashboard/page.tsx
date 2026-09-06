import Decimal from "decimal.js";
import { addMonths, format, parse } from "date-fns";

import { cookies } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { convert } from "@/lib/fx/convert";
import {
  getMonthlyAverageRates,
  rateForMonthWithFallback,
} from "@/lib/fx/monthlyAverage";
import { computeHoldingPL } from "@/lib/investments/calculations";
import { derivePositions, openPositions } from "@/lib/investments/positions";
import { monthlyInvestmentFlows } from "@/lib/investments/cashFlow";
import { appliesToMonth } from "@/lib/cashflow/calculations";
import {
  cashAmountForMonth,
  statementTotalsByCurrency,
} from "@/lib/expenses/creditCard";
import {
  buildLedger,
  ledgerByMonth,
  monthSequence,
} from "@/lib/expenses/cardBalance";
import { loanEntriesForMonth } from "@/lib/loans/schedule";
import {
  accrualMonthForCashMonth,
  salaryForCashMonth,
} from "@/lib/cashflow/salaryTiming";
import { groupBySource } from "@/lib/dashboard/monthlyBreakdown";
import { totalCarriers } from "@/lib/dashboard/stackTotals";
import {
  defaultRange,
  parseRange,
  RANGE_COOKIE,
} from "@/lib/dashboard/rangePreference";
import { formatMoneyWhole, formatMonth, formatSignedWhole } from "@/lib/format";
import { CalcInfo } from "@/components/ui/calc-info";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import type { CashFlowPoint } from "@/components/charts/CashFlowChart";
import { DashboardFilters } from "./dashboard-filters";
import { CashflowSection, type MonthDetail } from "./cashflow-section";

const MAX_RANGE_MONTHS = 24;

function monthRange(from: string, to: string): string[] {
  const fromDate = parse(from, "yyyy-MM", new Date());
  const toDate = parse(to, "yyyy-MM", new Date());
  const [start, end] = fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];

  const months: string[] = [];
  let cursor = start;
  while (cursor <= end && months.length < MAX_RANGE_MONTHS) {
    months.push(format(cursor, "yyyy-MM"));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const params = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      username: true,
      baseCurrency: true,
      salaryPaymentMonthOffset: true,
    },
  });
  const baseCurrency = user.baseCurrency;
  // Maaş hak edildiği ayda değil, ödendiği ayda nakit akışına girer.
  const salaryOffset = user.salaryPaymentMonthOffset;

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");

  // Aralık önceliği: adres çubuğundaki parametreler (paylaşılan/yer imli
  // bağlantılar çalışsın diye) > bu oturumdaki seçim (çerez) > varsayılan
  // son 6 ay. Çerez oturumluk olduğu için her yeni girişte son 6 aya döner.
  const savedRange = parseRange((await cookies()).get(RANGE_COOKIE)?.value);
  const fallback = defaultRange(now);
  const defaultFrom = savedRange?.from ?? fallback.from;
  const defaultTo = savedRange?.to ?? fallback.to;
  const from = typeof params.from === "string" ? params.from : defaultFrom;
  const to = typeof params.to === "string" ? params.to : defaultTo;
  const months = monthRange(from, to);

  const [
    transactions,
    incomeEntries,
    expenses,
    loans,
    cardPayments,
    salaryResults,
    fxRates,
  ] =
    await Promise.all([
      prisma.investmentTransaction.findMany({ where: { userId } }),
      prisma.incomeEntry.findMany({ where: { userId }, include: { category: true } }),
      prisma.expense.findMany({ where: { userId }, include: { category: true } }),
      prisma.loan.findMany({
        where: { userId },
        include: { periods: { orderBy: { effectiveFrom: "asc" } } },
      }),
      prisma.creditCardStatementPayment.findMany({ where: { userId } }),
      prisma.monthlySalaryResult.findMany({ where: { userId } }),
      // Kur kaynağına ulaşılamazsa (ve cache de boşsa) sayfanın tamamen
      // çökmesindense çevrim yapılmadan devam edilir; tutarlar karma olur ve
      // arayüzde uyarı gösterilir.
      Promise.all([
        convert(1, "TRY", baseCurrency),
        convert(1, "USD", baseCurrency),
      ]).catch(() => null),
    ]);

  const fxUnavailable = fxRates === null;
  const [tryToBaseRate, usdToBaseRate] = fxRates ?? [
    new Decimal(1),
    new Decimal(1),
  ];

  const holdings = openPositions(
    derivePositions(
      transactions.map((t) => ({
        symbol: t.symbol,
        assetType: t.assetType,
        side: t.side,
        quantity: t.quantity.toString(),
        pricePerUnit: t.pricePerUnit.toString(),
        currency: t.currency,
        tradedAt: t.tradedAt,
        createdAt: t.createdAt,
      }))
    )
  );

  function rateFor(currency: string): Decimal {
    if (currency === "TRY") return tryToBaseRate;
    if (currency === "USD") return usdToBaseRate;
    return new Decimal(1); // desteklenmeyen para birimi: en iyi çaba, dönüştürülmeden bırak
  }

  /** Güncel kurla çevirir — yalnızca "bugünkü durum" gösteren yerler için. */
  function toBaseSync(amount: Decimal, currency: string): Decimal {
    return amount.mul(rateFor(currency));
  }

  // Aylık tutarlar, ait oldukları ayın TCMB ortalama kuruyla çevrilir.
  // Bugünkü kurla çevirmek, kur yükseldikçe geçmiş ayların gelir/giderini de
  // olduğundan büyük gösterirdi.
  // Maaş, görünen aralığın öncesindeki bir aydan geldiği için (ödeme
  // gecikmesi) o ayların kuru da sorguya dahil edilmeli.
  const monthlyRates = await getMonthlyAverageRates([
    ...new Set([
      ...months,
      ...months.map((m) => accrualMonthForCashMonth(m, salaryOffset)),
    ]),
  ]);
  const monthsWithoutOwnRate: string[] = [];

  function toBaseForMonth(
    amount: Decimal,
    currency: string,
    month: string
  ): Decimal {
    if (currency === baseCurrency) return amount;

    const { rate: usdTry, isExact } = rateForMonthWithFallback(
      month,
      monthlyRates,
      // Kur hiç yoksa güncel USD/TRY'ye düş: baz TRY ise USD->TRY oranı,
      // baz USD ise TRY->USD oranının tersi.
      baseCurrency === "TRY" ? usdToBaseRate : new Decimal(1).div(tryToBaseRate)
    );
    if (!isExact && !monthsWithoutOwnRate.includes(month)) {
      monthsWithoutOwnRate.push(month);
    }

    // usdTry: 1 USD kaç TRY
    if (currency === "USD" && baseCurrency === "TRY") return amount.mul(usdTry);
    if (currency === "TRY" && baseCurrency === "USD") return amount.div(usdTry);
    return amount;
  }

  const priceSnapshots =
    holdings.length > 0
      ? await prisma.priceSnapshot.findMany({
          where: {
            OR: holdings.map((h) => ({
              symbol: h.symbol,
              assetType: h.assetType as never,
            })),
          },
        })
      : [];

  let totalMarketValue = new Decimal(0);
  let totalPL = new Decimal(0);
  // Maliyet toplamı yalnızca K/Z kutusunun altındaki yüzde için; fiyatı
  // alınamayan holding'ler piyasa değerine girmediği için maliyeti de
  // sayılmamalı, yoksa yüzde olduğundan kötü çıkar.
  let totalCost = new Decimal(0);

  for (const holding of holdings) {
    const price = priceSnapshots.find(
      (p) => p.symbol === holding.symbol && p.assetType === holding.assetType
    );
    if (!price) continue;

    const pl = computeHoldingPL(holding.quantity, holding.avgCostBasis, price.price);
    totalMarketValue = totalMarketValue.plus(toBaseSync(pl.marketValue, price.currency));
    totalPL = totalPL.plus(toBaseSync(pl.unrealizedPL, price.currency));
    totalCost = totalCost.plus(toBaseSync(pl.costBasis, price.currency));
  }

  const salaryByMonth = new Map(
    salaryResults.map((r) => [
      r.month,
      { amount: (r.actualAmount ?? r.total).toString(), currency: r.currency },
    ])
  );

  const loanInputs = loans.map((loan) => ({
    id: loan.id,
    name: loan.name,
    currency: loan.currency,
    startMonth: loan.startMonth,
    endMonth: loan.endMonth,
    periods: loan.periods.map((p) => ({
      effectiveFrom: p.effectiveFrom,
      amount: p.amount.toString(),
    })),
  }));

  /*
   * Kart ekstre defteri. Kart kalemi artık kayıtlı harcamaların toplamı değil,
   * o ay GERÇEKTEN ödenen tutardır: asgari ödemede ödenmeyen kısım sonraki aya
   * devreder. Ödeme girilmemiş aylarda tamamı ödenmiş sayılır, yani hiçbir
   * ödeme kaydı yokken davranış eskisiyle aynıdır.
   *
   * Devir zinciri kesintisiz olmalı, bu yüzden defter görünen aralıktan değil
   * ilk kart hareketinden itibaren kurulur; aksi halde aralığın başındaki
   * devreden borç sıfırdan başlardı.
   */
  const cardExpenseInputs = expenses
    .filter((e) => e.kind === "CREDIT_CARD")
    .map((e) => ({
      entry: e,
      input: {
        date: format(e.date, "yyyy-MM-dd"),
        paymentMonth: e.paymentMonth,
        frequency: e.frequency,
        amount: e.amount.toString(),
        installmentCount: e.installmentCount,
        currency: e.currency,
      },
    }));

  const ledgerAnchors = [
    ...cardExpenseInputs.map((c) => c.input.paymentMonth ?? c.input.date.slice(0, 7)),
    ...cardPayments.map((p) => p.month),
    ...months,
  ];
  const ledgerMonths =
    ledgerAnchors.length > 0
      ? monthSequence(
          ledgerAnchors.reduce((a, b) => (a < b ? a : b)),
          ledgerAnchors.reduce((a, b) => (a > b ? a : b))
        )
      : [];

  const cardStatements = statementTotalsByCurrency(
    cardExpenseInputs.map((c) => c.input),
    ledgerMonths
  );
  const cardCurrencies = [
    ...new Set([
      ...cardExpenseInputs.map((c) => c.input.currency),
      ...cardPayments.map((p) => p.currency),
    ]),
  ];
  const cardLedgers = new Map(
    cardCurrencies.map((currency) => [
      currency,
      ledgerByMonth(
        buildLedger({
          months: ledgerMonths,
          statementByMonth: cardStatements.get(currency) ?? new Map(),
          paymentByMonth: new Map(
            cardPayments
              .filter((p) => p.currency === currency)
              .map((p) => [p.month, new Decimal(p.amount.toString())])
          ),
        })
      ),
    ])
  );

  // Yatırımın aylık nakit etkisi. Açılış pozisyonları hariç tutulur; onların
  // parası uygulama daha yokken çıkmıştır.
  const investmentFlows = monthlyInvestmentFlows({
    transactions: transactions.map((t) => ({
      symbol: t.symbol,
      assetType: t.assetType,
      side: t.side,
      quantity: new Decimal(t.quantity.toString()),
      pricePerUnit: new Decimal(t.pricePerUnit.toString()),
      currency: t.currency,
      tradedAt: t.tradedAt,
      createdAt: t.createdAt,
      isOpening: t.isOpening,
      // Çekilmeden bırakılan satış hasılatı nakit akışına girmez.
      proceedsWithdrawn: t.proceedsWithdrawn,
    })),
    months,
    toBase: toBaseForMonth,
  });

  const history: CashFlowPoint[] = [];
  const details: MonthDetail[] = [];

  for (const month of months) {
    const incomeThisMonth = incomeEntries.filter((e) => appliesToMonth(e, month));

    // Nakit/havale giderleri kendi ayında çıkar.
    const otherExpensesThisMonth = expenses.filter(
      (e) => e.kind === "OTHER" && appliesToMonth(e, month)
    );
    // Kart harcamaları ekstrenin ÖDENDİĞİ ayda çıkar; harcama ayında değil.
    // Taksitliyse yalnızca o aya düşen taksit sayılır. Kategori dağılımı ise
    // harcama ayını kullanır (Giderler sekmesinde).
    const cardThisMonth = expenses
      .filter((e) => e.kind === "CREDIT_CARD")
      .map((e) => ({
        entry: e,
        cash: cashAmountForMonth(
          {
            date: format(e.date, "yyyy-MM-dd"),
            paymentMonth: e.paymentMonth,
            frequency: e.frequency,
            amount: e.amount.toString(),
            installmentCount: e.installmentCount,
          },
          month
        ),
      }))
      .filter((row) => !row.cash.isZero());

    const sumInBase = (list: typeof expenses) =>
      list.reduce(
        (acc, e) =>
          acc.plus(
            toBaseForMonth(new Decimal(e.amount.toString()), e.currency, month)
          ),
        new Decimal(0)
      );

    const otherIncomeBase = incomeThisMonth.reduce(
      (acc, e) =>
        acc.plus(toBaseForMonth(new Decimal(e.amount.toString()), e.currency, month)),
      new Decimal(0)
    );
    const otherExpensesBase = sumInBase(otherExpensesThisMonth);

    // Nakit akışı gerçekleşen ödemeyi kullanır; kategori listesi ise kayıtlı
    // harcamalara dayanır. İkisi arasındaki fark (devreden borç ödemesi ya da
    // bu ay ödenmeyen kısım) listeye ayrı bir satır olarak yazılır, yoksa
    // liste çubuktaki rakamı tutmaz.
    let creditCardBase = new Decimal(0);
    let cardGapBase = new Decimal(0);
    for (const [currency, ledger] of cardLedgers) {
      const row = ledger.get(month);
      if (!row) continue;
      creditCardBase = creditCardBase.plus(
        toBaseForMonth(row.paid, currency, month)
      );
      cardGapBase = cardGapBase.plus(
        toBaseForMonth(row.paid.minus(row.statement), currency, month)
      );
    }

    const loanEntries = loanEntriesForMonth(loanInputs, month);
    // Kredi başına baz para birimindeki tutar; balonda alt kırılım olarak
    // gösterilir ve toplam bunların üzerinden kurulur.
    const loanBreakdown = loanEntries.map((entry) => ({
      name: entry.name,
      amountInBase: toBaseForMonth(entry.amount, entry.currency, month),
    }));
    const loanBase = loanBreakdown.reduce(
      (acc, entry) => acc.plus(entry.amountInBase),
      new Decimal(0)
    );

    // Yatırım nakit hareketi netleştirilmiş gelir: pozitifse cepten yatırıma
    // gitmiş (gider tarafı), negatifse yatırımdan cebe gelmiş (gelir tarafı).
    // Aynı ayki alım/satımlar birbirini götürdüğü için sütunlar paranın kendi
    // içinde dönmesiyle şişmez. Ayrıntı için lib/investments/cashFlow.
    const investmentFlow = investmentFlows.get(month);
    const netInvested = investmentFlow?.netInvested ?? new Decimal(0);
    const investmentOut = Decimal.max(netInvested, 0);
    const investmentIn = Decimal.max(netInvested.neg(), 0);

    const expensesBase = otherExpensesBase
      .plus(creditCardBase)
      .plus(loanBase)
      .plus(investmentOut);

    // Bu ay elimize geçen maaş, `salaryOffset` ay önce hak edilmiş olandır.
    // Çevrim de hak ediş ayının kuruyla yapılır (bkz. salaryForCashMonth).
    const { amount: salaryBase, accrualMonth: salaryAccrualMonth } =
      salaryForCashMonth({
        cashMonth: month,
        offset: salaryOffset,
        salaryByAccrualMonth: salaryByMonth,
        toBase: toBaseForMonth,
      });

    const incomeBase = salaryBase.plus(otherIncomeBase).plus(investmentIn);

    // Yığın toplamı etiketleri, en üstteki sıfır olmayan dilime bağlanır;
    // gerekçesi lib/dashboard/stackTotals içinde.
    const [totalAtSalary, totalAtOtherIncome, totalAtInvestmentIn] =
      totalCarriers([
        salaryBase.toNumber(),
        otherIncomeBase.toNumber(),
        investmentIn.toNumber(),
      ]);
    const [
      totalAtOtherExpenses,
      totalAtCreditCard,
      totalAtLoans,
      totalAtInvestmentOut,
    ] = totalCarriers([
      otherExpensesBase.toNumber(),
      creditCardBase.toNumber(),
      loanBase.toNumber(),
      investmentOut.toNumber(),
    ]);

    history.push({
      month,
      salary: salaryBase.toNumber(),
      otherIncome: otherIncomeBase.toNumber(),
      otherExpenses: otherExpensesBase.toNumber(),
      creditCard: creditCardBase.toNumber(),
      loanPayments: loanBase.toNumber(),
      loanBreakdown: loanBreakdown.map((entry) => ({
        name: entry.name,
        amount: entry.amountInBase.toNumber(),
      })),
      investmentOut: investmentOut.toNumber(),
      investmentIn: investmentIn.toNumber(),
      investmentGross: {
        bought: (investmentFlow?.bought ?? new Decimal(0)).toNumber(),
        sold: (investmentFlow?.sold ?? new Decimal(0)).toNumber(),
        realizedPL: (investmentFlow?.realizedPL ?? new Decimal(0)).toNumber(),
      },
      income: incomeBase.toNumber(),
      expenses: expensesBase.toNumber(),
      net: incomeBase.minus(expensesBase).toNumber(),
      isCurrent: month === currentMonth,
      totalAtSalary,
      totalAtOtherIncome,
      totalAtInvestmentIn,
      totalAtOtherExpenses,
      totalAtCreditCard,
      totalAtLoans,
      totalAtInvestmentOut,
      projected: month > currentMonth,
    });

    // Kalemler kaynağına göre gruplanır. Önceden üçü tek listede eriyor ve
    // nereden geldikleri yalnızca "Kart:" / "Kredi:" ön ekinden anlaşılıyordu;
    // kaynak toplamları hiç görünmüyordu. Sıra sabit: kart, kredi, genel.
    const expenseGroups = groupBySource([
      {
        source: "Kredi Kartı",
        entries: [
          ...cardThisMonth.map(({ entry, cash }) => ({
            // Taksitli harcamada bu ay yalnızca taksit kadar para çıkar.
            categoryName:
              entry.installmentCount > 1
                ? `${entry.category.name} (taksit)`
                : entry.category.name,
            amountInBase: toBaseForMonth(cash, entry.currency, month),
          })),
          ...(cardGapBase.isZero()
            ? []
            : [
                {
                  categoryName: cardGapBase.isPositive()
                    ? "Devreden borç ödemesi"
                    : "Bu ay ödenmeyen (devretti)",
                  amountInBase: cardGapBase,
                },
              ]),
        ],
      },
      {
        source: "Krediler",
        entries: loanEntries.map((entry) => ({
          categoryName: entry.name,
          amountInBase: toBaseForMonth(entry.amount, entry.currency, month),
        })),
      },
      {
        source: "Genel Giderler",
        entries: otherExpensesThisMonth.map((e) => ({
          categoryName: e.category.name,
          amountInBase: toBaseForMonth(
            new Decimal(e.amount.toString()),
            e.currency,
            month
          ),
        })),
      },
    ]);

    const incomeGroups = groupBySource([
      {
        source: "Maaş",
        entries: salaryBase.greaterThan(0)
          ? [
              {
                categoryName:
                  salaryOffset === 0
                    ? "Maaş"
                    : `${salaryAccrualMonth} hak edişi`,
                amountInBase: salaryBase,
              },
            ]
          : [],
      },
      {
        source: "Diğer Gelir",
        entries: incomeThisMonth.map((e) => ({
          categoryName: e.category.name,
          amountInBase: toBaseForMonth(
            new Decimal(e.amount.toString()),
            e.currency,
            month
          ),
        })),
      },
    ]);

    const flatten = (gs: typeof expenseGroups) =>
      gs.map((g) => ({
        source: g.source,
        total: g.total.toFixed(2),
        items: g.items.map((c) => ({
          category: c.category,
          amount: c.amount.toFixed(2),
        })),
      }));

    // Harcama dağılımı kaynağı (kart / kredi / genel) değil KATEGORİYİ
    // soruyor: aynı kategori iki kaynaktan geldiyse tek çubukta toplanır.
    // Aynı gruplardan türetildiği için toplamı sütundaki gider rakamını
    // tutar — ayrı bir sorgu iki sayının ayrışmasına açık olurdu.
    const byCategory = new Map<string, Decimal>();
    for (const group of expenseGroups) {
      for (const item of group.items) {
        byCategory.set(
          item.category,
          (byCategory.get(item.category) ?? new Decimal(0)).plus(item.amount)
        );
      }
    }

    details.push({
      month,
      incomeGroups: flatten(incomeGroups),
      expenseGroups: flatten(expenseGroups),
      expenseByCategory: [...byCategory].map(([category, amount]) => ({
        category,
        amount: amount.toFixed(2),
      })),
    });
  }

  /*
   * Kart "Bu Ayki" diyor, o hâlde içinde bulunulan ayı göstermeli. Eskiden
   * aralığın SON ayı gösteriliyordu: projeksiyon açıkken (+3/+6 Ay) kart
   * gelecek bir ayın netini yazıyor, grafikteki bu ayın netiyle tutmuyordu.
   *
   * Cari ay seçili aralığın dışındaysa (kullanıcı geçmişe bakıyorsa) sayı
   * yine gösterilir ama başlıkta ayın adı yazar; kart hiçbir durumda yanlış
   * ay için "bu ay" dememeli.
   */
  const currentPoint = history.find((point) => point.isCurrent);
  const summaryPoint = currentPoint ?? history[history.length - 1];

  /*
   * Kart borcunun ay sonunda DEVREDEN kısmı. Ekstre tutarından farklı:
   * ekstre o ayın harcaması, devreden ise ödenmemiş bakiye. Kutuda devreden
   * duruyor çünkü ekstre zaten grafikte "Kredi Kartı" diliminde görünüyor,
   * devreden ise hiçbir yerde yazmıyordu — büyüyen bir borç ancak Kredi
   * Kartı sekmesine girilince fark ediliyordu.
   */
  let cardCarry = new Decimal(0);
  for (const [currency, ledger] of cardLedgers) {
    const row = ledger.get(summaryPoint.month);
    if (!row) continue;
    cardCarry = cardCarry.plus(
      toBaseForMonth(row.closingBalance, currency, summaryPoint.month)
    );
  }
  // Ödemenin kayıtlı borcu aşması neredeyse her zaman eksik harcama kaydı
  // demek; eksi bir "borç" göstermek yerine sıfırlanır (bkz. cardBalance).
  const cardCarryDisplay = Decimal.max(cardCarry, 0);
  const cardPaymentMonth = format(
    addMonths(parse(summaryPoint.month, "yyyy-MM", new Date()), 1),
    "yyyy-MM"
  );

  const rangeLabel = `${formatMonth(from)} — ${formatMonth(to)} · ${months.length} ay`;

  // Grafiğin başlığı altındaki not: yalnızca o aralıkta GEÇERLİ olan
  // uyarılar yazılır. Sabit metin olarak hepsi durduğunda not grafikten
  // uzuyor ve hiçbiri okunmuyordu.
  const chartNote = (
    <>
      Farklı para birimindeki tutarlar ait oldukları ayın TCMB ortalama
      kuruyla {baseCurrency}&apos;ye çevrilir.
      {salaryOffset > 0 && (
        <> Maaş ödendiği aya yazılır ({salaryOffset} ay gecikme).</>
      )}
      {monthsWithoutOwnRate.length > 0 && (
        <> {monthsWithoutOwnRate.length} ay için en yakın önceki ayın kuru kullanıldı.</>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
            Genel Bakış
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            {rangeLabel} · {user.name ?? user.username}
          </p>
        </div>
        <DashboardFilters from={from} to={to} />
      </header>

      {fxUnavailable && (
        <div className="border-destructive bg-accent text-accent-foreground border px-4 py-3">
          <p className="text-[14px] font-extrabold">Kur bilgisi alınamadı</p>
          <p className="mt-1 text-[13px] leading-snug">
            Döviz kuru kaynağına şu an ulaşılamıyor ve önbellekte de kayıtlı
            bir kur yok. Farklı para birimlerindeki tutarlar çevrilmeden
            toplandığı için aşağıdaki rakamlar <strong>karma</strong> ve
            yanıltıcı olabilir. Kur geldiğinde kendiliğinden düzelir.
          </p>
        </div>
      )}

      <StatStrip>
        <Stat
          label="Portföy değeri"
          value={formatMoneyWhole(totalMarketValue.toNumber(), baseCurrency)}
          caption="güncel kurla"
          info={
            <CalcInfo title="Portföy Değeri nasıl hesaplanır">
              <p>
                Her <strong>açık</strong> pozisyon için: adet × güncel fiyat.
                Fiyatlar CoinGecko veya Yahoo Finance&apos;ten çekilir;
                tamamen satılmış pozisyonlar elde bir şey kalmadığı için
                buraya girmez.
              </p>
              <p>
                Sonra her holding kendi fiyat para biriminden senin baz para
                birimine çevrilir ve toplanır.
              </p>
            </CalcInfo>
          }
        />
        <Stat
          label="Açık pozisyon K/Z"
          value={formatSignedWhole(totalPL.toNumber(), baseCurrency)}
          tone={totalPL.isNegative() ? "negative" : "default"}
          caption={
            totalCost.isZero()
              ? "maliyet kaydı yok"
              : `maliyete göre %${totalPL.div(totalCost).times(100).toFixed(1)}`
          }
          info={
            <CalcInfo title="Açık Pozisyon Kâr/Zarar nasıl hesaplanır">
              <p>
                Her <strong>açık</strong> pozisyon için: (adet × güncel fiyat)
                − (adet × ağırlıklı ortalama maliyet). Sonuç baz para birimine
                çevrilip toplanır.
              </p>
              <p>
                Henüz satılmamış, yani &quot;kâğıt üstündeki&quot;
                kâr/zarardır; satışlardan gerçekleşmiş kâr/zarar buraya
                girmez. Gerçekleşen ve toplam kâr/zarar için Yatırımlar
                sayfasına bak.
              </p>
            </CalcInfo>
          }
        />
        <Stat
          label={`${formatMonth(summaryPoint.month)} net nakit akışı`}
          value={formatSignedWhole(summaryPoint.net, baseCurrency)}
          tone={summaryPoint.net < 0 ? "negative" : "default"}
          caption={
            <>
              gelir {formatMoneyWhole(summaryPoint.income, baseCurrency)} ·
              gider {formatMoneyWhole(summaryPoint.expenses, baseCurrency)}
              {summaryPoint.projected && " · projeksiyon"}
            </>
          }
          info={
            <CalcInfo title="Net Nakit Akışı nasıl hesaplanır">
              <p>
                (O ay ödenen maaş + o aya ait gelir kayıtları) − o aya ait
                harcama kayıtları. Aylık tekrarlayan kayıtlar başladığı aydan
                itibaren her ay dahil edilir.
              </p>
              <p>
                Yatırım da cepten çıkan para olduğu için dahildir: o ayki alım
                ve satımlar netleştirilir, kalan tutar yönüne göre gelire ya da
                gidere yazılır. Açılış pozisyonları (uygulamayı kullanmaya
                başlamadan önce sahip olduklarınız) sayılmaz.
              </p>
              <p>
                Tutarlar, ait oldukları ayın TCMB ortalama kuruyla baz para
                birimine çevrilerek toplanır.
              </p>
              <p>
                Bu kutu içinde bulunulan ayı gösterir; grafikteki o ayın Net
                değeriyle aynıdır. Seçtiğin aralık bu ayı kapsamıyorsa
                başlıkta aralığın son ayı yazar.
              </p>
            </CalcInfo>
          }
        />
        <Stat
          label="Kart borcu (devreden)"
          value={formatMoneyWhole(cardCarryDisplay.toNumber(), baseCurrency)}
          caption={
            cardCarryDisplay.isZero()
              ? "ekstre tamamen ödenmiş"
              : `${formatMonth(cardPaymentMonth)} ekstresine ekleniyor`
          }
          info={
            <CalcInfo title="Devreden kart borcu nasıl hesaplanır">
              <p>
                (Devreden borç + o ayın ekstresi) − o ay yapılan ödeme. Ödeme
                girilmemişse ekstrenin tamamı ödenmiş sayılır ve devreden
                sıfır çıkar.
              </p>
              <p>
                Ödemenin kayıtlı borcu aşması neredeyse her zaman eksik
                harcama kaydı anlamına geldiği için eksi bakiye devretmez;
                ayrıntı Kredi Kartı sekmesindeki ekstre defterinde.
              </p>
            </CalcInfo>
          }
        />
      </StatStrip>

      <CashflowSection
        data={history}
        details={details}
        baseCurrency={baseCurrency}
        currentMonth={currentMonth}
        note={chartNote}
      />
    </div>
  );
}

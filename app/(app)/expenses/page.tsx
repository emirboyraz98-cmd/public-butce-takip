import Link from "next/link";
import Decimal from "decimal.js";
import { format } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Tabs } from "@/components/ui/tabs";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { formatMoney, formatMonth } from "@/lib/format";
import { CreditCardSummary, type CardEntry } from "./credit-card-summary";
import {
  CreditCardOffsetForm,
  CreditCardStatementDayForm,
} from "./credit-card-offset-form";
import { type LoanRow } from "./loan-table";
import { LoansTab } from "./loans-tab";
import {
  CategoryBreakdown,
  type BreakdownEntry,
} from "@/components/money/category-breakdown";
import {
  installmentMonths,
  shiftMonth,
  statementTotalsByCurrency,
} from "@/lib/expenses/creditCard";
import {
  assumedPaymentsAfterCarry,
  buildLedger,
  monthSequence,
} from "@/lib/expenses/cardBalance";
import { createMonthlyBaseConverter } from "@/lib/fx/monthlyBase";
import { CardLedger, type LedgerViewRow } from "./card-ledger";
import { ExpenseList } from "./expense-list";
import type { RecordRow } from "@/components/money/record-list";
import { PendingImports, type PendingImportRow } from "./pending-imports";
import {
  installmentForMonth,
  installmentSchedule,
  summarizeLoan,
} from "@/lib/loans/schedule";

export default async function ExpensesPage() {
  const session = await auth();
  const userId = session!.user.id;
  const currentMonth = format(new Date(), "yyyy-MM");

  const [user, categories, expenses, loans, cardPayments, pendingImports] =
    await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        creditCardPaymentMonthOffset: true,
        baseCurrency: true,
        creditCardStatementDay: true,
      },
    }),
    prisma.expenseCategory.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
    prisma.expense.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { date: "desc" },
    }),
    prisma.loan.findMany({
      where: { userId },
      include: { periods: { orderBy: { effectiveFrom: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.creditCardStatementPayment.findMany({ where: { userId } }),
    // Mailden gelip henüz gidere dönüşmemiş kayıtlar. En eskisi üstte:
    // biriken kuyruğun başından temizlemek doğal sıra.
    prisma.importedTransaction.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const pendingImportRows: PendingImportRow[] = pendingImports.map((t) => ({
    id: t.id,
    date: format(t.occurredAt, "yyyy-MM-dd"),
    kind: t.kind,
    sector: t.sector,
    cardLast4: t.cardLast4,
    installmentCount: t.installmentCount,
    amount: t.amount?.toString() ?? null,
    currency: t.currency,
    rawAmount: t.rawAmount.toString(),
    rawCurrency: t.rawCurrency,
    suggestedCategoryId: t.suggestedCategoryId,
    paymentMonth: t.paymentMonth,
  }));

  const cardExpenses = expenses.filter((e) => e.kind === "CREDIT_CARD");

  // Gizlenen kategoriler yeni kayıt formlarında çıkmaz; geçmiş kayıtların
  // etiketi olarak durmaya devam eder.
  const categoryOptions = categories
    .filter((c) => !c.archived)
    .map((c) => ({ id: c.id, name: c.name }));

  const cardSummaryEntries: CardEntry[] = cardExpenses.map((e) => ({
    date: format(e.date, "yyyy-MM-dd"),
    paymentMonth: e.paymentMonth,
    amount: Number(e.amount),
    currency: e.currency,
    frequency: e.frequency,
    installmentCount: e.installmentCount,
  }));

  // Özet kutusunun ay listesi: harcama ve ödeme aylarının birleşimi, en yeni
  // önce. İkisi farklı olduğu için tek birinden türetmek ay kaçırırdı.
  // Taksitli harcamalar ileri aylara yayıldığı için tüm taksit ayları da
  // listeye girer; yoksa son taksitlerin düştüğü aylar seçilemezdi.
  const cardMonths = [
    ...new Set(
      cardSummaryEntries.flatMap((e) => [
        e.date.slice(0, 7),
        ...installmentMonths(e),
      ])
    ),
  ].sort((a, b) => b.localeCompare(a));

  // Ekstre defteri: devir zinciri kesintisiz olmalı, bu yüzden ilk kart
  // hareketinden son taksit ayına kadar TÜM aylar üretilir. Harcaması olmayan
  // bir ay atlanırsa o ayda devreden borç kaybolurdu.
  const ledgerCurrencies = [
    ...new Set([
      ...cardExpenses.map((e) => e.currency),
      ...cardPayments.map((p) => p.currency),
    ]),
  ];
  const ledgerMonthCandidates = [
    ...cardSummaryEntries.flatMap((e) => [e.date.slice(0, 7), ...installmentMonths(e)]),
    ...cardPayments.map((p) => p.month),
    currentMonth,
  ];
  const ledgerMonths =
    ledgerMonthCandidates.length > 0
      ? monthSequence(
          ledgerMonthCandidates.reduce((a, b) => (a < b ? a : b)),
          ledgerMonthCandidates.reduce((a, b) => (a > b ? a : b))
        )
      : [];

  const statementsByCurrency = statementTotalsByCurrency(
    cardExpenses.map((e) => ({
      date: format(e.date, "yyyy-MM-dd"),
      paymentMonth: e.paymentMonth,
      frequency: e.frequency,
      amount: e.amount.toString(),
      installmentCount: e.installmentCount,
      currency: e.currency,
    })),
    ledgerMonths
  );

  const ledgers = ledgerCurrencies.map((currency) => {
    const ledgerRows = buildLedger({
      months: ledgerMonths,
      statementByMonth: statementsByCurrency.get(currency) ?? new Map(),
      paymentByMonth: new Map(
        cardPayments
          .filter((p) => p.currency === currency)
          .map((p) => [p.month, new Decimal(p.amount.toString())])
      ),
      // Gelecek aylar defterde görünsün diye değil, devir doğru kurulsun
      // diye tüm aylar var; arayüz yalnızca hareketi olanları gösterir.
    });

    return {
      currency,
      ledgerRows,
      /** Gelecek aylardaki (henüz ödenemeyecek) planlı ekstre toplamı. */
      upcomingTotal: "0",
      rows: ledgerRows.map(
      (row): LedgerViewRow => ({
        month: row.month,
        openingBalance: row.openingBalance.toString(),
        statement: row.statement.toString(),
        due: row.due.toString(),
        paid: row.paid.toString(),
        isActual: row.isActual,
        closingBalance: row.closingBalance.toString(),
      })
    ),
    };
  }).map((ledger) => {
    /*
     * Defter, devir zinciri doğru kurulsun diye tüm aylar üzerinden
     * hesaplanır ama tabloda hepsi gösterilmez:
     *  - Baştaki hareketsiz aylar bilgi taşımaz.
     *  - İçinde bulunulan aydan sonrası henüz ödenemez; taksitli bir
     *    harcama tabloyu bir yıl ileriye uzatıp okunmaz hale getiriyordu.
     * Gelecekteki planlı ekstre toplamı tablonun altında tek satır özetlenir.
     */
    const firstActive = ledger.rows.findIndex(
      (row) => Number(row.statement) !== 0 || row.isActual
    );
    const visible = ledger.rows.filter(
      (row, index) =>
        index >= (firstActive === -1 ? ledger.rows.length : firstActive) &&
        row.month <= currentMonth
    );
    const upcoming = ledger.rows
      .filter((row) => row.month > currentMonth)
      .reduce((sum, row) => sum.plus(new Decimal(row.statement)), new Decimal(0));

    return {
      currency: ledger.currency,
      rows: visible,
      /*
       * İçinde bulunulan ayın satırı, TABLODA görünmese bile. Tablo yalnızca
       * hareketi olan ve geçmiş ayları gösteriyor; harcamaların tamamı
       * gelecek bir ekstreye düştüğünde tablo boş kalıyor ama üstteki şerit
       * yine de "bu ay ne oldu"yu söylemeli.
       */
      currentRow:
        ledger.rows.find((row) => row.month === currentMonth) ?? null,
      upcomingTotal: upcoming.toString(),
      /*
       * Devreden borcu olduğu hâlde ödemesi girilmemiş aylar. İçinde
       * bulunulan ay hariç: ekstresi henüz ödenmemiş olabilir.
       */
      assumedAfterCarry: assumedPaymentsAfterCarry(
        ledger.ledgerRows,
        shiftMonth(currentMonth, -1)
      ).map((item) => ({
        month: item.month,
        carried: item.carried.toString(),
      })),
    };
  });

  /*
   * Harcama alışkanlığı pastası ÖDEMEDEN tamamen bağımsızdır: ne zaman
   * harcadığını gösterir, parayı ne zaman ödediğini değil. Bu yüzden kart
   * harcamaları HARCAMA tarihiyle, taksitliyse tutarın TAMAMIYLA girer —
   * 12.000'lik telefon alındığı ayda 12.000'dir.
   *
   * Kredi taksitleri de dahil: kullanıcı "ay içindeki bütün harcamalarım"
   * görmek istiyor. Taksitlerin kategorisi olmadığı için kredi adıyla
   * listelenir.
   */
  const baseCurrency = user.baseCurrency;
  const toBase = await createMonthlyBaseConverter({
    months: [
      ...expenses.map((e) => format(e.date, "yyyy-MM")),
      ...loans.flatMap((loan) =>
        monthSequence(loan.startMonth, minMonth(loan.endMonth, currentMonth))
      ),
    ],
    baseCurrency,
  });

  // Liste satırları: kart ve nakit tek listede, ayrım rozette ve
  // filtre çipinde. Ayrı sekmelerdeyken "bu ay ne harcadım" sorusu iki
  // sekmeyi gözle toplamayı gerektiriyordu.
  const recordRows: RecordRow[] = expenses.map((e) => {
    const date = format(e.date, "yyyy-MM-dd");
    return {
      id: e.id,
      date,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      amount: e.amount.toString(),
      currency: e.currency,
      frequency: e.frequency,
      note: e.note,
      baseAmount: toBase(
        new Decimal(e.amount.toString()),
        e.currency,
        date.slice(0, 7)
      ).toFixed(2),
      kind: e.kind === "CREDIT_CARD" ? ("card" as const) : ("cash" as const),
      paymentMonth: e.paymentMonth,
      installmentCount: e.installmentCount,
    };
  });

  const spendingBreakdown: BreakdownEntry[] = [
    // Kategori adı ödeme yönteminden bağımsız: nakit ödenen "Yeme-İçme" ile
    // kartla ödenen "Yeme-İçme" tek kalemde toplanır — soru "toplam ne kadar
    // yemeğe verdim". Ayrıştırmak isteyen kaynak filtresini kullanır.
    ...expenses.map((e) => {
      const date = format(e.date, "yyyy-MM-dd");
      return {
        date,
        categoryName: e.category.name,
        amount: toBase(
          new Decimal(e.amount.toString()),
          e.currency,
          date.slice(0, 7)
        ).toNumber(),
        source: e.kind === "CREDIT_CARD" ? "Kredi Kartı" : "Genel Giderler",
      };
    }),
    // Kredi taksitleri bugüne kadar; ileri aylar "harcadım" değil, plandır.
    // Bunlar kategori değil, ayrı birer borç; aynı adlı bir harcama
    // kategorisiyle karışmasın diye ön ekli kalıyorlar.
    ...loans.flatMap((loan) =>
      monthSequence(loan.startMonth, minMonth(loan.endMonth, currentMonth))
        .map((month) => {
          const amount = installmentForMonth(
            {
              name: loan.name,
              currency: loan.currency,
              startMonth: loan.startMonth,
              endMonth: loan.endMonth,
              periods: loan.periods.map((p) => ({
                effectiveFrom: p.effectiveFrom,
                amount: p.amount.toString(),
              })),
            },
            month
          );
          if (!amount) return null;
          const entry: BreakdownEntry = {
            date: `${month}-01`,
            categoryName: `Kredi: ${loan.name}`,
            amount: toBase(amount, loan.currency, month).toNumber(),
            source: "Krediler",
          };
          return entry;
        })
        .filter((e): e is BreakdownEntry => e !== null)
    ),
  ];

  // Aylık Özet'in "ödenen" kutusu defterle aynı sayıyı göstermeli; aksi halde
  // aynı sayfada iki farklı "bu ay ödenen" olurdu.
  const paidByMonth: Record<string, Record<string, string>> = {};
  for (const ledger of ledgers) {
    for (const row of ledger.rows) {
      paidByMonth[row.month] ??= {};
      paidByMonth[row.month][ledger.currency] = row.paid;
    }
  }

  const loanRows: LoanRow[] = loans.map((loan) => {
    const input = {
      id: loan.id,
      name: loan.name,
      currency: loan.currency,
      startMonth: loan.startMonth,
      endMonth: loan.endMonth,
      periods: loan.periods.map((p) => ({
        effectiveFrom: p.effectiveFrom,
        amount: p.amount.toString(),
      })),
    };
    const summary = summarizeLoan(input, currentMonth);
    const current = installmentForMonth(input, currentMonth);

    return {
      id: loan.id,
      name: loan.name,
      currency: loan.currency,
      startMonth: loan.startMonth,
      endMonth: loan.endMonth,
      // Bir dönem, bir sonraki dönem başlayana kadar geçerli; bitiş ayı
      // burada türetilir ki veri tek yerde (başlangıç ayında) kalsın.
      periods: loan.periods.map((period, index) => {
        const next = loan.periods[index + 1];
        return {
          id: period.id,
          amount: period.amount.toString(),
          effectiveFrom: period.effectiveFrom,
          effectiveTo: next
            ? previousMonth(next.effectiveFrom)
            : loan.endMonth,
        };
      }),
      currentInstallment: current ? current.toString() : null,
      remainingInstallments: summary.remainingInstallments,
      remainingTotal: summary.remainingTotal
        ? summary.remainingTotal.toString()
        : null,
      paidTotal: summary.paidTotal.toString(),
      totalPayable: summary.totalPayable ? summary.totalPayable.toString() : null,
      totalInstallments: summary.totalInstallments,
      schedule: installmentSchedule(input, currentMonth, loan.paidMonths).map(
        (item) => ({
          month: item.month,
          amount: item.amount.toString(),
          paid: item.paid,
          past: item.past,
        })
      ),
    };
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
            Giderler
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Kart harcamaları, nakit/havale giderleri ve kredi taksitleri.
          </p>
        </div>
        <Link
          href="/expenses/categories"
          className="text-accent-text text-[13px] font-semibold underline underline-offset-4"
        >
          Kategorileri yönet
        </Link>
      </header>

      {/*
        Sekme sırası teslimattaki sırayla aynı. "Harcamalar" artık kart ve
        nakit kayıtlarının TAMAMI; ödeme yöntemi filtre çipi oldu. Eskiden
        ikisi ayrı sekmedeydi ve "bu ay ne harcadım" sorusu iki sekmeyi
        gözle toplamayı gerektiriyordu.
      */}
      <Tabs
        items={[
          {
            key: "records",
            label: "Harcamalar",
            content: (
              <div className="space-y-4">
                <ExpenseList
                  rows={recordRows}
                  categories={categoryOptions}
                  baseCurrency={baseCurrency}
                  statementOffset={user.creditCardPaymentMonthOffset}
                />

                {spendingBreakdown.length > 0 && (
                  <section className="border-border border">
                    <header className="border-border border-b-2 px-4 py-3">
                      <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                        Harcama alışkanlığı
                      </h2>
                      <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                        Kart harcamaları, diğer giderler ve o ayın kredi
                        taksitleri tek yerde.{" "}
                        <strong>Ödemeyle ilgisi yoktur</strong> — paranın ne
                        zaman çıktığına değil, harcamanın ne zaman yapıldığına
                        bakar. Taksitli bir alışveriş, alındığı ayda tutarının
                        tamamıyla görünür.
                      </p>
                    </header>
                    <div className="p-4">
                      <CategoryBreakdown
                        entries={spendingBreakdown}
                        baseCurrency={baseCurrency}
                      />
                    </div>
                  </section>
                )}
              </div>
            ),
          },
          {
            key: "credit-card",
            label: "Kredi kartı",
            content: (
              <CreditCardTab
                summaryEntries={cardSummaryEntries}
                months={cardMonths}
                offset={user.creditCardPaymentMonthOffset}
                statementDay={user.creditCardStatementDay}
                ledgers={ledgers}
                paidByMonth={paidByMonth}
                currentMonth={currentMonth}
              />
            ),
          },
          {
            key: "loans",
            label: "Krediler",
            content: <LoansTab loans={loanRows} currentMonth={currentMonth} />,
          },
          {
            key: "imports",
            label: "Bekleyen aktarımlar",
            // Rozet sayısı sekmenin üstünde: kuyruk dolduğunda sekmeye
            // girmeden görünmesi gerekiyor, yoksa harcamalar birikiyor.
            badge: pendingImportRows.length,
            content: (
              <div className="space-y-3">
                <p className="text-muted-foreground text-[13px] leading-snug">
                  Banka bildirim maillerinden okunan kart harcamaları.
                  Doğrudan listeye eklenmiyorlar çünkü mailde{" "}
                  <strong>işyeri adı yazmıyor</strong> — banka yalnızca sektör
                  gönderiyor (&quot;GIDA VE MARKET&quot;), sektörü
                  çözemediğinde ise &quot;KREDI KARTI&quot; yazıyor.
                  Kategoriyi ve ekstre ayını kontrol edip onayla; onayladıkların
                  Harcamalar listesine normal harcama olarak geçer.
                </p>
                <PendingImports
                  rows={pendingImportRows}
                  categories={categoryOptions}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** İkisinden erken olanı; bitiş yoksa sınır ayı. */
function minMonth(endMonth: string | null, cap: string): string {
  if (!endMonth) return cap;
  return endMonth < cap ? endMonth : cap;
}

/** yyyy-MM'den bir önceki ay. */
function previousMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function CreditCardTab({
  summaryEntries,
  months,
  offset,
  statementDay,
  ledgers,
  paidByMonth,
  currentMonth,
}: {
  summaryEntries: CardEntry[];
  months: string[];
  offset: number;
  statementDay: number;
  paidByMonth: Record<string, Record<string, string>>;
  currentMonth: string;
  ledgers: {
    currency: string;
    rows: LedgerViewRow[];
    currentRow: LedgerViewRow | null;
    upcomingTotal: string;
    assumedAfterCarry: { month: string; carried: string }[];
  }[];
}) {
  // Şerit, ilk defterin (baz para birimi genelde tek olur) içinde
  // bulunulan ay satırından okunur. Birden fazla para birimi varsa şerit
  // ilkini gösterir ve defterler zaten para birimi başına ayrı çiziliyor.
  const primary = ledgers[0];
  const thisMonthRow = primary?.currentRow ?? null;

  return (
    <div className="space-y-4">
      {thisMonthRow && primary && (
        <StatStrip>
          <Stat
            label={`${formatMonth(currentMonth)} ekstresi`}
            value={formatMoney(thisMonthRow.statement, primary.currency)}
            caption="bu ayın harcamaları"
          />
          <Stat
            label="Ödenen"
            value={formatMoney(thisMonthRow.paid, primary.currency)}
            caption={
              thisMonthRow.isActual ? "elle girilen tutar" : "tamamı varsayıldı"
            }
          />
          <Stat
            label="Devreden"
            value={formatMoney(thisMonthRow.closingBalance, primary.currency)}
            tone={
              Number(thisMonthRow.closingBalance) > 0 ? "negative" : "default"
            }
            caption={
              Number(thisMonthRow.closingBalance) > 0
                ? `${formatMonth(shiftMonth(currentMonth, 1))} borcuna ekleniyor`
                : "borç kalmadı"
            }
          />
          <Stat
            label="Yaklaşan"
            value={formatMoney(primary.upcomingTotal, primary.currency)}
            caption="henüz ödenmemiş ekstreler"
          />
        </StatStrip>
      )}

      {/* Kart harcamaları artık "Harcamalar" sekmesinde; burada yalnızca
          ekstre defteri, özet ve kartın kendi ayarları kalıyor. Kayıt
          eklemek için ayrı bir form yok — Harcamalar sekmesindeki tek
          pencere ödeme türü segmentiyle kart kaydını da açıyor. */}
      <section className="border-border border">
        <header className="border-border border-b-2 px-4 py-3">
          <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
            Kart ayarları
          </h2>
          <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
            Harcamanın <strong>yapıldığı tarih</strong> ile{" "}
            <strong>ekstrenin ödendiği ay</strong> ayrı tutulur: kategori
            dağılımı harcama tarihine, Genel Bakış&apos;taki nakit akışı ise
            ödeme ayına göre hesaplanır. Buradaki iki ayar ödeme ayının
            önerisini belirler; her kayıtta ayrıca değiştirilebilir.
          </p>
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <CreditCardOffsetForm offset={offset} />
          <CreditCardStatementDayForm day={statementDay} />
        </div>
      </section>

      {/* Defter ve özet aynı ayın iki farklı okuması; benzer boyda ve
          birlikte bakılıyorlar. Alt alta dizildiklerinde kredi kartı
          sekmesi iki ekran boyu uzuyordu. */}
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-2">
        {ledgers.map((ledger) => (
          <section key={ledger.currency} className="border-border border">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                Ekstre defteri
                {ledgers.length > 1 && ` — ${ledger.currency}`}
              </h2>
              <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                Uygulama varsayılan olarak ekstrenin tamamının ödendiğini kabul
                eder. Asgari ödeme yaptığın bir ayda gerçekte ödediğin tutarı
                &quot;Ödenen&quot; sütununa yazarsan, ödenmeyen kısım{" "}
                <strong>sonraki ayın borcuna eklenir</strong> ve Genel
                Bakış&apos;taki nakit akışı gerçekte cebinden çıkanı gösterir.
                Kart ödemesini başka bir sekmeye gider olarak yazma; iki kez
                sayılır.
              </p>
            </header>
            <div className="p-4">
              <CardLedger
                rows={ledger.rows}
                currency={ledger.currency}
                upcomingTotal={ledger.upcomingTotal}
                assumedAfterCarry={ledger.assumedAfterCarry}
              />
            </div>
          </section>
        ))}
        {months.length > 0 && (
          <section className="border-border border">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                Aylık özet
              </h2>
              <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                Bir ayda ne kadar harcadığın ile o ay cebinden ne kadar çıktığı
                farklı sayılardır; ikisi de burada.
              </p>
            </header>
            <div className="p-4">
              <CreditCardSummary
                entries={summaryEntries}
                months={months}
                paidByMonth={paidByMonth}
                defaultMonth={currentMonth}
              />
            </div>
          </section>
        )}
      </div>

      {/* Özet en altta: önce kayıt girilir, sonra ekstre defteri okunur,
          en son o ayın toplamına bakılır. */}
    </div>
  );
}



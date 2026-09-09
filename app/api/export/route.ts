import { format } from "date-fns";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/export/csv";
import {
  buildInvestmentRows,
  buildMonthlyRows,
  buildRecordRows,
  INVESTMENT_HEADERS,
  type ToBase,
} from "@/lib/export/moneyRows";
import { createMonthlyBaseConverter } from "@/lib/fx/monthlyBase";
import { monthOf } from "@/lib/expenses/creditCard";

/** Dosya adı: butce-takip-giderler-2026-08-12.csv */
function fileName(extension: string, suffix?: string): string {
  const parts = ["butce-takip", suffix, format(new Date(), "yyyy-MM-dd")].filter(
    Boolean
  );
  return `${parts.join("-")}.${extension}`;
}

function download(
  body: string,
  type: string,
  extension: string,
  suffix?: string
) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${fileName(extension, suffix)}"`,
      // Yedek her zaman güncel veriyi vermeli.
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 401 });
  }
  const userId = session.user.id;

  const params = new URL(request.url).searchParams;
  const csv = params.get("format") === "csv";
  /*
   * Liste başlıklarındaki "CSV indir" yalnızca o listeyi indirir; Ayarlar'
   * daki tam yedek kapsamsız çağırır ve her şeyi verir. Kapsam sunucuda
   * uygulanıyor: istemcide süzmek, indirilen dosyanın ekranda görünenle
   * tutmasını tesadüfe bırakırdı.
   *
   *   income | expenses  -> kayıt dökümü (ekrandaki listenin aynısı)
   *   monthly            -> aya yayılmış nakit dökümü (pivot için)
   *   investments        -> yatırım işlem defteri
   *   (yok)              -> gelir + gider kayıt dökümü
   */
  const scope = params.get("scope");
  const wantIncome = scope === null || scope === "income";
  const wantExpenses = scope === null || scope === "expenses";

  /*
   * Ekrandaki tarih aralığı. Listede "Bu ay" seçiliyken indirilen dosyanın
   * tüm geçmişi vermesi, dosyayı ekrandakiyle karşılaştıran herkesi yanıltır.
   */
  const isDate = (v: string | null): v is string =>
    v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const from = isDate(rawFrom) ? rawFrom : null;
  const to = isDate(rawTo) ? rawTo : null;
  // Aralıktan önce başlamış aylık tekrarlayan kayıtlar (kira, abonelik):
  // listede kutucukla açılıyor, dosyada da aynı kutucuğa uyuyor.
  const keepOngoing = params.get("ongoing") === "1";

  const dateFilter =
    from === null && to === null
      ? {}
      : {
          date: {
            ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
          },
        };
  const ongoingFilter =
    keepOngoing && from
      ? [
          {
            frequency: "MONTHLY" as const,
            date: { lt: new Date(`${from}T00:00:00Z`) },
          },
        ]
      : [];
  /*
   * Aralık YALNIZCA CSV'ye uygulanır. JSON tam yedektir; oradan tarih
   * süzmek, kullanıcının "yedeğim" sandığı dosyayı sessizce eksiltirdi.
   */
  const rangeWhere = !csv
    ? {}
    : ongoingFilter.length > 0
      ? { OR: [dateFilter, ...ongoingFilter] }
      : dateFilter;

  // passwordHash bilerek dışarıda: yedek dosyası kimseye şifre sızdırmamalı.
  const [
    user,
    incomeCategories,
    incomes,
    expenseCategories,
    expenses,
    loans,
    cardPayments,
    workPeriods,
    baseSalaryRates,
    referenceFxRates,
    salaryResults,
    investments,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true,
        username: true,
        baseCurrency: true,
        // Uygulama artık okumuyor (maaş türü baz maaş dönemine taşındı),
        // ama eski dışa aktarmalarla karşılaştırılabilsin diye kalıyor.
        salaryMode: true,
        salaryPaymentMonthOffset: true,
        creditCardPaymentMonthOffset: true,
        createdAt: true,
      },
    }),
    prisma.incomeCategory.findMany({ where: { userId } }),
    prisma.incomeEntry.findMany({
      where: { userId, ...rangeWhere },
      include: { category: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.expenseCategory.findMany({ where: { userId } }),
    prisma.expense.findMany({
      where: { userId, ...rangeWhere },
      include: { category: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.loan.findMany({
      where: { userId },
      include: { periods: { orderBy: { effectiveFrom: "asc" } } },
    }),
    prisma.creditCardStatementPayment.findMany({ where: { userId } }),
    prisma.workPeriod.findMany({ where: { userId }, orderBy: { startDate: "asc" } }),
    prisma.baseSalaryRate.findMany({ where: { userId } }),
    prisma.referenceFxRate.findMany({ where: { userId } }),
    prisma.monthlySalaryResult.findMany({
      where: { userId },
      orderBy: { month: "asc" },
    }),
    prisma.investmentTransaction.findMany({
      where: { userId },
      orderBy: { tradedAt: "asc" },
    }),
  ]);

  const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

  if (csv) {
    const asOfMonth = format(new Date(), "yyyy-MM");
    const baseCurrency = user.baseCurrency;

    const incomeRows = incomes.map((e) => ({
      date: dateKey(e.date),
      categoryName: e.category.name,
      amount: e.amount.toString(),
      currency: e.currency,
      frequency: e.frequency,
      note: e.note,
    }));
    const expenseRows = expenses.map((e) => ({
      date: dateKey(e.date),
      categoryName: e.category.name,
      amount: e.amount.toString(),
      currency: e.currency,
      frequency: e.frequency,
      note: e.note,
      kind: e.kind,
      paymentMonth: e.paymentMonth,
      installmentCount: e.installmentCount,
    }));
    const loanRows = loans.map((l) => ({
      name: l.name,
      currency: l.currency,
      startMonth: l.startMonth,
      endMonth: l.endMonth,
      paidMonths: l.paidMonths,
      periods: l.periods.map((p) => ({
        effectiveFrom: p.effectiveFrom,
        amount: p.amount.toString(),
      })),
    }));

    if (scope === "investments") {
      const rows = buildInvestmentRows(
        investments.map((t) => ({
          date: dateKey(t.tradedAt),
          type: t.side,
          symbol: t.symbol,
          assetType: t.assetType,
          quantity: t.quantity.toString(),
          price: t.pricePerUnit.toString(),
          currency: t.currency,
          note: t.note,
        }))
      );
      return download(
        toCsv(INVESTMENT_HEADERS, rows),
        "text/csv",
        "csv",
        "yatirimlar"
      );
    }

    /*
     * Kur çevirici, dosyada geçen BÜTÜN ayları önden ister: tek tek çağırmak
     * ay başına bir kur sorgusu demekti. Aylık dökümde taksitler ve
     * tekrarlar ileri aylara uzadığından liste kayıtların kendi aylarından
     * ibaret değil; bugüne kadar olan aralık da eklenir.
     */
    const months = new Set<string>([asOfMonth]);
    for (const e of [...incomeRows, ...expenseRows]) {
      months.add(monthOf(e.date));
      if (e.frequency === "MONTHLY") {
        for (let m = monthOf(e.date); m <= asOfMonth; m = nextMonth(m)) {
          months.add(m);
        }
      }
    }
    for (const e of expenseRows) {
      if (e.paymentMonth) months.add(e.paymentMonth);
    }
    for (const l of loanRows) {
      months.add(l.startMonth);
      if (l.endMonth) months.add(l.endMonth);
    }
    for (const s of salaryResults) months.add(s.month);

    const convert = await createMonthlyBaseConverter({
      months: [...months],
      baseCurrency,
    });
    const toBase: ToBase = (amount, currency, month) =>
      convert(amount, currency, month);

    if (scope === "monthly") {
      const { headers, rows } = buildMonthlyRows({
        incomes: incomeRows,
        expenses: expenseRows,
        loans: loanRows,
        salaries: salaryResults.map((r) => ({
          month: r.month,
          mode: r.mode,
          currency: r.currency,
          total: r.total.toString(),
          actualAmount: r.actualAmount?.toString() ?? null,
        })),
        asOfMonth,
        baseCurrency,
        toBase,
      });
      return download(toCsv(headers, rows), "text/csv", "csv", "aylik-dokum");
    }

    const { headers, rows } = buildRecordRows({
      incomes: wantIncome ? incomeRows : [],
      expenses: wantExpenses ? expenseRows : [],
      baseCurrency,
      toBase,
    });
    const suffix =
      scope === "income" ? "gelirler" : scope === "expenses" ? "giderler" : undefined;
    return download(toCsv(headers, rows), "text/csv", "csv", suffix);
  }

  const payload = {
    disaAktarma: {
      tarih: new Date().toISOString(),
      surum: 1,
      aciklama:
        "Bütçe Takip veri yedeği. Şifre bilgisi içermez. Para birimi ve tutarlar kayıtta saklandığı gibidir.",
    },
    kullanici: user,
    gelirKategorileri: incomeCategories,
    gelirler: incomes.map(({ category, ...e }) => ({
      ...e,
      kategoriAdi: category.name,
    })),
    giderKategorileri: expenseCategories,
    giderler: expenses.map(({ category, ...e }) => ({
      ...e,
      kategoriAdi: category.name,
    })),
    krediler: loans,
    kartEkstreOdemeleri: cardPayments,
    // Uygulama artık okumuyor (çalışma günleri takvimden gün gün
    // işaretleniyor), ama dışa aktarma kullanıcının GEÇMİŞ verisi: eski
    // aralıkları buradan çıkarmak, dosyayı indirenin elindeki tarihçeyi
    // sessizce eksiltirdi.
    calismaDonemleri: workPeriods,
    bazMaaslar: baseSalaryRates,
    referansKurlar: referenceFxRates,
    maasSonuclari: salaryResults,
    yatirimIslemleri: investments,
  };

  return download(
    JSON.stringify(payload, null, 2),
    "application/json",
    "json"
  );
}

/** `2026-12` → `2027-01`. */
function nextMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

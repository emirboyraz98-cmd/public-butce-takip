import { format } from "date-fns";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/export/csv";
import { buildMoneyRows, MONEY_CSV_HEADERS } from "@/lib/export/moneyRows";

/** Dosya adı: butce-takip-2026-08-12.json */
function fileName(extension: string): string {
  return `butce-takip-${format(new Date(), "yyyy-MM-dd")}.${extension}`;
}

function download(body: string, type: string, extension: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${fileName(extension)}"`,
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
   */
  const scope = params.get("scope");
  const wantIncome = scope === null || scope === "income";
  const wantExpenses = scope === null || scope === "expenses";

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
      where: { userId },
      include: { category: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.expenseCategory.findMany({ where: { userId } }),
    prisma.expense.findMany({
      where: { userId },
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
    const rows = buildMoneyRows({
      asOfMonth: format(new Date(), "yyyy-MM"),
      incomes: (wantIncome ? incomes : []).map((e) => ({
        date: dateKey(e.date),
        categoryName: e.category.name,
        amount: e.amount.toString(),
        currency: e.currency,
        frequency: e.frequency,
        note: e.note,
      })),
      expenses: (wantExpenses ? expenses : []).map((e) => ({
        date: dateKey(e.date),
        categoryName: e.category.name,
        amount: e.amount.toString(),
        currency: e.currency,
        frequency: e.frequency,
        note: e.note,
        kind: e.kind,
        paymentMonth: e.paymentMonth,
        installmentCount: e.installmentCount,
      })),
      loans: (wantExpenses ? loans : []).map((l) => ({
        name: l.name,
        currency: l.currency,
        startMonth: l.startMonth,
        endMonth: l.endMonth,
        paidMonths: l.paidMonths,
        periods: l.periods.map((p) => ({
          effectiveFrom: p.effectiveFrom,
          amount: p.amount.toString(),
        })),
      })),
    });

    return download(toCsv(MONEY_CSV_HEADERS, rows), "text/csv", "csv");
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

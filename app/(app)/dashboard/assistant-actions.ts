"use server";

import Decimal from "decimal.js";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMonthlyBaseConverter } from "@/lib/fx/monthlyBase";
import { monthSequence } from "@/lib/date/months";
import { toMonthKeyUtc } from "@/lib/date/utc";
import { shiftMonth } from "@/lib/cashflow/salaryTiming";
import { installmentForMonth } from "@/lib/loans/schedule";
import {
  answerQuestion,
  EXAMPLES,
  type Answer,
  type Movement,
  type Part,
  type Row,
} from "@/lib/assistant/answer";
import { parseQuestion } from "@/lib/assistant/parseQuestion";

/**
 * Soru kutusunun sunucu tarafı.
 *
 * Dışarıya hiçbir istek gitmiyor, API anahtarı yok: soru kural tabanlı
 * çözümleniyor (bkz. lib/assistant/parseQuestion) ve kullanıcının kendi
 * verisiyle cevaplanıyor (lib/assistant/answer).
 *
 * Burada yalnızca veri hazırlanıyor: gelir ve gider kayıtları, hesaplanmış
 * maaş (ödendiği aya yazılarak) ve kredi taksitleri tek bir "hareket"
 * listesine çevriliyor, hepsi baz para birimine.
 */

export type AssistantView = {
  kind: Answer["kind"] | "unparsed";
  parts: Part[];
  rows: Row[];
  more: number;
  context: string[];
  link: { href: string; label: string } | null;
  suggestions: string[];
};

function gorunum(a: Partial<AssistantView> & Pick<AssistantView, "kind" | "parts">): AssistantView {
  return { rows: [], more: 0, context: [], link: null, suggestions: [], ...a };
}

export async function askAssistant(
  _prev: AssistantView | null,
  formData: FormData
): Promise<AssistantView> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return gorunum({ kind: "unparsed", parts: [{ t: "Oturum bulunamadı." }] });

  const raw = ((formData.get("question") as string | null) ?? "").slice(0, 300);
  if (raw.trim() === "") {
    return gorunum({ kind: "unparsed", parts: [{ t: "Bir soru yaz ya da aşağıdaki örneklerden birini seç." }], suggestions: EXAMPLES });
  }

  const [user, expenseCategories, incomeCategories, expenses, incomes, loans, salaryResults] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true, salaryPaymentMonthOffset: true, creditCardMonthlyLimit: true },
    }),
    prisma.expenseCategory.findMany({
      where: { userId },
      select: { name: true, archived: true, monthlyLimit: true },
    }),
    prisma.incomeCategory.findMany({ where: { userId }, select: { name: true } }),
    prisma.expense.findMany({ where: { userId }, include: { category: { select: { name: true } } } }),
    prisma.incomeEntry.findMany({ where: { userId }, include: { category: { select: { name: true } } } }),
    prisma.loan.findMany({
      where: { userId },
      include: { periods: { orderBy: { effectiveFrom: "asc" } } },
    }),
    prisma.monthlySalaryResult.findMany({ where: { userId } }),
  ]);

  const now = new Date();
  const question = parseQuestion(raw, now, {
    expenseCategories: expenseCategories.map((c) => c.name),
    incomeCategories: [...incomeCategories.map((c) => c.name), "Maaş"],
    loans: loans.map((l) => l.name),
  });
  if (!question) {
    return gorunum({
      kind: "unparsed",
      parts: [
        { t: "Bu soruyu anlayamadım. ", b: true },
        { t: "Harcama, gelir, birikim, bütçe ya da karşılaştırma sorabilirsin." },
      ],
      suggestions: EXAMPLES,
    });
  }

  /*
   * Kur, tutarın AİT OLDUĞU ayın TCMB ortalamasıyla — sitenin geri kalanıyla
   * aynı taban. Aralık, en eski kayıttan bir yıl sonrasına kadar: sorunun
   * hangi döneme düşeceği çözümlemeden sonra belli oluyor, maaş ve kredi
   * de ileri aylara uzanabiliyor.
   */
  const buAy = toMonthKeyUtc(now);
  const ufuk = shiftMonth(buAy, 12);
  const ilkAylar = [
    ...expenses.map((e) => toMonthKeyUtc(e.date)),
    ...incomes.map((e) => toMonthKeyUtc(e.date)),
    ...loans.map((l) => l.startMonth),
    ...salaryResults.map((r) => r.month),
  ];
  const ilkAy = ilkAylar.reduce((a, m) => (m < a ? m : a), buAy);
  const toBase = await createMonthlyBaseConverter({
    months: monthSequence(ilkAy, ufuk),
    baseCurrency: user.baseCurrency,
  });

  const cevir = (amount: Decimal.Value, currency: string, month: string) =>
    toBase(new Decimal(amount), currency, month);

  const movements: Movement[] = [];

  for (const e of expenses) {
    const ay = toMonthKeyUtc(e.date);
    const tutar = e.amount.toString();
    movements.push({
      date: e.date.toISOString().slice(0, 10),
      direction: "out",
      categoryName: e.category.name,
      note: e.note,
      source: e.kind === "CREDIT_CARD" ? "card" : "cash",
      paymentMonth: e.paymentMonth,
      amount: cevir(tutar, e.currency, ay),
      frequency: e.frequency,
      recurrenceEndMonth: e.recurrenceEndMonth,
      // Yabancı paralı aylık kayıt her ay kendi ayının kuruyla.
      amountForMonth:
        e.frequency === "MONTHLY" && e.currency !== user.baseCurrency
          ? (m) => cevir(tutar, e.currency, m)
          : undefined,
    });
  }

  for (const e of incomes) {
    const ay = toMonthKeyUtc(e.date);
    const tutar = e.amount.toString();
    movements.push({
      date: e.date.toISOString().slice(0, 10),
      direction: "in",
      categoryName: e.category.name,
      note: e.note,
      source: "income",
      amount: cevir(tutar, e.currency, ay),
      frequency: e.frequency,
      recurrenceEndMonth: e.recurrenceEndMonth,
      amountForMonth:
        e.frequency === "MONTHLY" && e.currency !== user.baseCurrency
          ? (m) => cevir(tutar, e.currency, m)
          : undefined,
    });
  }

  /*
   * Maaş, Genel Bakış'taki gibi ÖDENDİĞİ aya yazılıyor (hak ediş +
   * gecikme) ve HAK EDİLDİĞİ ayın kuruyla çevriliyor; ödeme ayının kuruyla
   * çevirmek aynı kur farkını iki kez uygulardı. Gün bilinmiyor; ayın 1'i.
   */
  for (const r of salaryResults) {
    const odemeAyi = shiftMonth(r.month, user.salaryPaymentMonthOffset);
    movements.push({
      date: `${odemeAyi}-01`,
      direction: "in",
      categoryName: "Maaş",
      note: null,
      source: "salary",
      amount: cevir((r.actualAmount ?? r.total).toString(), r.currency, r.month),
      frequency: "ONE_TIME",
      accrualMonth: r.month,
    });
  }

  // Kredi taksitleri: her ay, ayın 1'inde. Süresiz kredi bir yıl ileriye kadar.
  for (const loan of loans) {
    const son = loan.endMonth && loan.endMonth < ufuk ? loan.endMonth : ufuk;
    const plan = {
      name: loan.name,
      currency: loan.currency,
      startMonth: loan.startMonth,
      endMonth: loan.endMonth,
      periods: loan.periods.map((p) => ({ effectiveFrom: p.effectiveFrom, amount: p.amount.toString() })),
    };
    for (const ay of monthSequence(loan.startMonth, son)) {
      const taksit = installmentForMonth(plan, ay);
      if (!taksit) continue;
      movements.push({
        date: `${ay}-01`,
        direction: "out",
        categoryName: loan.name,
        note: null,
        source: "loan",
        amount: cevir(taksit.toString(), loan.currency, ay),
        frequency: "ONE_TIME",
      });
    }
  }

  const answer = answerQuestion({
    question,
    movements,
    budgets: expenseCategories
      .filter((c) => !c.archived)
      .map((c) => ({
        categoryName: c.name,
        limit: c.monthlyLimit === null ? null : new Decimal(c.monthlyLimit.toString()),
      })),
    cardLimit:
      user.creditCardMonthlyLimit === null ? null : new Decimal(user.creditCardMonthlyLimit.toString()),
    currency: user.baseCurrency,
    now,
  });

  return gorunum(answer);
}

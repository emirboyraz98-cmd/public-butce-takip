"use server";

import Decimal from "decimal.js";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMonthlyBaseConverter } from "@/lib/fx/monthlyBase";
import { monthSequence } from "@/lib/date/months";
import { toMonthKeyUtc } from "@/lib/date/utc";
import { answerQuestion, type AnswerEntry } from "@/lib/assistant/answer";
import { parseQuestion } from "@/lib/assistant/parseQuestion";

/**
 * Soru kutusunun sunucu tarafı.
 *
 * Dışarıya hiçbir istek gitmiyor, API anahtarı yok: soru kural tabanlı
 * çözümleniyor (bkz. lib/assistant/parseQuestion) ve kullanıcının kendi
 * verisiyle cevaplanıyor.
 */

export type AssistantLine = {
  categoryName: string;
  amount: string;
  share: number;
};

export type AssistantReport = {
  metric: "expense" | "income" | "net";
  fromLabel: string;
  toLabel: string;
  rangeLabel: string;
  categoryQuery: string | null;
  total: string;
  expenseTotal: string;
  incomeTotal: string;
  dailyAverage: string;
  lines: AssistantLine[];
  count: number;
  dayCount: number;
  baseCurrency: string;
  /** "En çok nereye harcadım" sorulduysa en büyük kalem öne çıkar. */
  topCategory: string | null;
  /** Giderler sayfasında aynı aralığı açan bağlantı. */
  detailsHref: string;
};

export type AssistantResult =
  | { ok: true; report: AssistantReport }
  | { ok: false; reason: "unparsed" | "empty" };

export async function askAssistant(
  _prev: AssistantResult | null,
  formData: FormData
): Promise<AssistantResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, reason: "empty" };

  const raw = (formData.get("question") as string | null) ?? "";
  if (raw.trim() === "") return { ok: false, reason: "empty" };

  const [user, expenseCategories, expenses, incomes] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true },
    }),
    prisma.expenseCategory.findMany({
      where: { userId },
      select: { name: true },
    }),
    prisma.expense.findMany({
      where: { userId },
      include: { category: { select: { name: true } } },
    }),
    prisma.incomeEntry.findMany({
      where: { userId },
      include: { category: { select: { name: true } } },
    }),
  ]);

  const question = parseQuestion(
    raw,
    new Date(),
    expenseCategories.map((c) => c.name)
  );
  if (!question) return { ok: false, reason: "unparsed" };

  /*
   * Kur, tutarın AİT OLDUĞU ayın TCMB ortalamasıyla uygulanıyor — sitenin
   * geri kalanıyla aynı taban. Bugünün kuruyla çevirmek, geçmiş aylardaki
   * harcamayı kur yükseldikçe büyük gösterirdi.
   */
  const months = monthSequence(
    question.from.slice(0, 7),
    question.to.slice(0, 7)
  );
  const toBase = await createMonthlyBaseConverter({
    months,
    baseCurrency: user.baseCurrency,
  });

  const cevir = (
    amount: Decimal.Value,
    currency: string,
    date: Date
  ): Decimal => toBase(new Decimal(amount), currency, toMonthKeyUtc(date));

  const giderGirdileri: AnswerEntry[] = expenses.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    categoryName: e.category.name,
    amountInBase: cevir(e.amount.toString(), e.currency, e.date),
    frequency: e.frequency,
    recurrenceEndMonth: e.recurrenceEndMonth,
  }));

  const gelirGirdileri: AnswerEntry[] = incomes.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    categoryName: e.category.name,
    amountInBase: cevir(e.amount.toString(), e.currency, e.date),
    frequency: e.frequency,
    recurrenceEndMonth: e.recurrenceEndMonth,
  }));

  const report = answerQuestion({
    question,
    expenses: giderGirdileri,
    incomes: gelirGirdileri,
  });

  // Decimal sunucu sınırını geçemez; metne çevriliyor.
  return {
    ok: true,
    report: {
      metric: report.metric,
      fromLabel: report.from,
      toLabel: report.to,
      rangeLabel: report.rangeLabel,
      categoryQuery: report.categoryQuery,
      total: report.total.toFixed(2),
      expenseTotal: report.expenseTotal.toFixed(2),
      incomeTotal: report.incomeTotal.toFixed(2),
      dailyAverage: report.total.div(report.dayCount).toFixed(2),
      lines: report.lines.slice(0, 8).map((l) => ({
        categoryName: l.categoryName,
        amount: l.amount.toFixed(2),
        share: l.share,
      })),
      count: report.count,
      dayCount: report.dayCount,
      baseCurrency: user.baseCurrency,
      topCategory:
        question.wantsTop && report.lines.length > 0
          ? report.lines[0].categoryName
          : null,
      detailsHref: `/expenses?from=${report.from}&to=${report.to}`,
    },
  };
}

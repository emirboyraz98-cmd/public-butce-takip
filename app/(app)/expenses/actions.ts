"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isValidPaymentMonth } from "@/lib/expenses/creditCard";
import { expenseEntrySchema } from "@/lib/validation/expense";

type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

function parseExpenseForm(formData: FormData) {
  return expenseEntrySchema.safeParse({
    categoryId: formData.get("categoryId"),
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    note: formData.get("note") || undefined,
    date: formData.get("date"),
    frequency: formData.get("frequency"),
    kind: formData.get("kind") || undefined,
    paymentMonth: formData.get("paymentMonth") || undefined,
    installmentCount: formData.get("installmentCount")
      ? Number(formData.get("installmentCount"))
      : undefined,
  });
}

/**
 * Ödeme ayı yalnızca kredi kartı kayıtlarında anlamlıdır ve harcamadan önce
 * olamaz. Diğer giderlerde alan boşaltılır ki nakit akışı kaydı yanlış aya
 * taşımasın.
 */
function resolvePaymentMonth(
  kind: "OTHER" | "CREDIT_CARD",
  date: string,
  paymentMonth: string | undefined
): { value: string | null } | { error: string } {
  if (kind !== "CREDIT_CARD") return { value: null };
  if (!paymentMonth) return { error: "Ödeme ayı gerekli" };
  if (!isValidPaymentMonth(date, paymentMonth)) {
    return { error: "Ödeme ayı, harcama ayından önce olamaz" };
  }
  return { value: paymentMonth };
}

/**
 * Taksit yalnızca kredi kartındaki TEK SEFERLİK harcamalarda anlamlı.
 * Aylık tekrarlayan bir kayıt zaten her ay yeniden çıkıyor; onu bir de
 * taksitlendirmek aynı tutarı iki kez bölmek olurdu. Taksit seçilmişse
 * kayıt tek seferliğe sabitlenir.
 */
function resolveInstallments(
  kind: "OTHER" | "CREDIT_CARD",
  frequency: "ONE_TIME" | "MONTHLY",
  requested: number | undefined
): { installmentCount: number; frequency: "ONE_TIME" | "MONTHLY" } {
  const count = kind === "CREDIT_CARD" ? (requested ?? 1) : 1;
  if (count > 1) return { installmentCount: count, frequency: "ONE_TIME" };
  return { installmentCount: 1, frequency };
}

function revalidateAll() {
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}

export async function createExpense(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = parseExpenseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { categoryId, amount, currency, note, date } = parsed.data;
  const kind = parsed.data.kind ?? "OTHER";

  const payment = resolvePaymentMonth(kind, date, parsed.data.paymentMonth);
  if ("error" in payment) return { error: payment.error };

  const { installmentCount, frequency } = resolveInstallments(
    kind,
    parsed.data.frequency,
    parsed.data.installmentCount
  );

  const category = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, userId },
  });
  if (!category) {
    return { error: "Geçersiz kategori" };
  }

  await prisma.expense.create({
    data: {
      userId,
      categoryId,
      amount,
      currency,
      note,
      date: new Date(`${date}T00:00:00Z`),
      frequency,
      kind,
      paymentMonth: payment.value,
      installmentCount,
    },
  });

  revalidateAll();
  return { success: true };
}

export async function updateExpense(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Kayıt bulunamadı" };

  const parsed = parseExpenseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { categoryId, amount, currency, note, date } = parsed.data;
  const kind = parsed.data.kind ?? "OTHER";

  const payment = resolvePaymentMonth(kind, date, parsed.data.paymentMonth);
  if ("error" in payment) return { error: payment.error };

  const { installmentCount, frequency } = resolveInstallments(
    kind,
    parsed.data.frequency,
    parsed.data.installmentCount
  );

  // Hem kaydın hem de seçilen kategorinin bu kullanıcıya ait olduğu doğrulanır.
  const [existing, category] = await Promise.all([
    prisma.expense.findFirst({ where: { id, userId } }),
    prisma.expenseCategory.findFirst({ where: { id: categoryId, userId } }),
  ]);
  if (!existing) return { error: "Kayıt bulunamadı" };
  if (!category) return { error: "Geçersiz kategori" };

  await prisma.expense.update({
    where: { id },
    data: {
      categoryId,
      amount,
      currency,
      note: note ?? null,
      date: new Date(`${date}T00:00:00Z`),
      frequency,
      kind,
      paymentMonth: payment.value,
      installmentCount,
    },
  });

  revalidateAll();
  return { success: true };
}

export async function deleteExpense(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  await prisma.expense.deleteMany({ where: { id, userId } });
  revalidateAll();
  return { success: true };
}

/** Kredi kartı ekstresinin kaç ay sonra ödendiği (yeni kayıtlara öneri). */
export async function setCreditCardOffset(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const offset = Number(formData.get("offset"));
  if (!Number.isInteger(offset) || offset < 0 || offset > 3) {
    return { error: "Gecikme 0 ile 3 ay arasında olmalı" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { creditCardPaymentMonthOffset: offset },
  });

  revalidateAll();
  return { success: true };
}

/**
 * Ekstrenin kesildiği gün. Otomatik aktarımda ödeme ayı bununla önerilir.
 *
 * 28 ile sınırlı: şubatta 29/30/31 diye bir gün yok ve "ayın 30'u" diyen
 * bir kesim günü yılda bir ay sessizce kayardı.
 */
export async function setCreditCardStatementDay(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const day = Number(formData.get("day"));
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return { error: "Kesim günü 1 ile 28 arasında olmalı" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { creditCardStatementDay: day },
  });

  revalidateAll();
  return { success: true };
}

/**
 * Kart harcamaları için toplam aylık sınır (baz para birimi).
 *
 * Boş gönderilirse sınır kaldırılır — bu, sınırı 0 yapmaktan farklı:
 * null "takip etme", 0 ise "kartı hiç kullanmayacağım" hedefi. Kategori
 * sınırları da aynı ayrımı yapıyor.
 */
export async function setCreditCardMonthlyLimit(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const raw = String(formData.get("limit") ?? "").trim();

  if (raw === "") {
    await prisma.user.update({
      where: { id: userId },
      data: { creditCardMonthlyLimit: null },
    });
    revalidateAll();
    return { success: true };
  }

  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit < 0) {
    return { error: "Sınır 0 veya daha büyük bir sayı olmalı" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { creditCardMonthlyLimit: limit },
  });

  revalidateAll();
  return { success: true };
}

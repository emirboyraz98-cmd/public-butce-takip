"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loanPeriodSchema, loanSchema } from "@/lib/validation/expense";
import {
  resolvePeriodEndChange,
  type PeriodEndChange,
} from "@/lib/loans/periodBoundary";

type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

function revalidateAll() {
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}

/** Krediye ait olduğu doğrulanmadan hiçbir dönem yazılmaz/silinmez. */
async function assertOwnsLoan(loanId: string, userId: string) {
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  return loan !== null;
}

export async function createLoan(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = loanSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    startMonth: formData.get("startMonth"),
    endMonth: formData.get("endMonth") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { name, currency, startMonth, endMonth } = parsed.data;
  if (endMonth && endMonth < startMonth) {
    return { error: "Bitiş ayı, başlangıç ayından önce olamaz" };
  }

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "İlk taksit tutarı 0'dan büyük olmalı" };
  }

  // Kredi ile ilk dönemi birlikte oluşturulur: taksiti olmayan bir kredi
  // hiçbir aya gider yazmaz, kullanıcıya boş satır olarak görünürdü.
  await prisma.loan.create({
    data: {
      userId,
      name,
      currency,
      startMonth,
      endMonth: endMonth ?? null,
      periods: { create: { amount, effectiveFrom: startMonth } },
    },
  });

  revalidateAll();
  return { success: true };
}

export async function updateLoan(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Kredi bulunamadı" };

  const parsed = loanSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    startMonth: formData.get("startMonth"),
    endMonth: formData.get("endMonth") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { name, currency, startMonth, endMonth } = parsed.data;
  if (endMonth && endMonth < startMonth) {
    return { error: "Bitiş ayı, başlangıç ayından önce olamaz" };
  }

  if (!(await assertOwnsLoan(id, userId))) return { error: "Kredi bulunamadı" };

  await prisma.loan.update({
    where: { id },
    data: { name, currency, startMonth, endMonth: endMonth ?? null },
  });

  revalidateAll();
  return { success: true };
}

export async function deleteLoan(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  // Dönemler onDelete: Cascade ile birlikte silinir.
  await prisma.loan.deleteMany({ where: { id, userId } });
  revalidateAll();
  return { success: true };
}

export async function createLoanPeriod(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = loanPeriodSchema.safeParse({
    loanId: formData.get("loanId"),
    amount: Number(formData.get("amount")),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { loanId, amount, effectiveFrom } = parsed.data;

  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) return { error: "Kredi bulunamadı" };
  if (effectiveFrom < loan.startMonth) {
    return { error: "Dönem, kredinin başlangıcından önce başlayamaz" };
  }
  if (loan.endMonth && effectiveFrom > loan.endMonth) {
    return { error: "Dönem, kredinin bitişinden sonra başlayamaz" };
  }

  const duplicate = await prisma.loanPeriod.findFirst({
    where: { loanId, effectiveFrom },
  });
  if (duplicate) {
    return { error: "Bu ay için zaten bir dönem var; onu düzenleyebilirsin" };
  }

  await prisma.loanPeriod.create({ data: { loanId, amount, effectiveFrom } });

  revalidateAll();
  return { success: true };
}

export async function updateLoanPeriod(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Dönem bulunamadı" };

  const parsed = loanPeriodSchema.safeParse({
    loanId: formData.get("loanId"),
    amount: Number(formData.get("amount")),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { loanId, amount, effectiveFrom } = parsed.data;

  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) return { error: "Kredi bulunamadı" };

  const existing = await prisma.loanPeriod.findFirst({ where: { id, loanId } });
  if (!existing) return { error: "Dönem bulunamadı" };

  if (effectiveFrom < loan.startMonth) {
    return { error: "Dönem, kredinin başlangıcından önce başlayamaz" };
  }
  if (loan.endMonth && effectiveFrom > loan.endMonth) {
    return { error: "Dönem, kredinin bitişinden sonra başlayamaz" };
  }

  const clash = await prisma.loanPeriod.findFirst({
    where: { loanId, effectiveFrom, NOT: { id } },
  });
  if (clash) {
    return { error: "Bu ay için zaten başka bir dönem var" };
  }

  // Bitiş ayı saklanmaz, komşudan türer; düzenlenmişse komşu güncellenir.
  // Gerekçe ve kurallar: lib/loans/periodBoundary.
  const rawEnd = formData.get("effectiveTo");
  let endChange: PeriodEndChange | null = null;

  if (typeof rawEnd === "string" && rawEnd) {
    const others = await prisma.loanPeriod.findMany({
      where: { loanId },
      select: { id: true, effectiveFrom: true },
    });
    // Kaydedilecek yeni başlangıç, bitiş kuralına da yansımalı.
    const periods = others.map((p) =>
      p.id === id ? { ...p, effectiveFrom } : p
    );

    const resolved = resolvePeriodEndChange({
      periods,
      periodId: id,
      newEnd: rawEnd,
      loanEndMonth: loan.endMonth,
    });
    if (!resolved.ok) return { error: resolved.error };
    endChange = resolved.change;
  }

  await prisma.$transaction([
    prisma.loanPeriod.update({
      where: { id },
      data: { amount, effectiveFrom },
    }),
    ...(endChange?.kind === "nextPeriodStart"
      ? [
          prisma.loanPeriod.update({
            where: { id: endChange.periodId },
            data: { effectiveFrom: endChange.newStart },
          }),
        ]
      : []),
    ...(endChange?.kind === "loanEndMonth"
      ? [
          prisma.loan.update({
            where: { id: loanId },
            data: { endMonth: endChange.newEndMonth },
          }),
        ]
      : []),
  ]);

  revalidateAll();
  return { success: true };
}

export async function deleteLoanPeriod(id: string): Promise<ActionState> {
  const userId = await requireUserId();

  const period = await prisma.loanPeriod.findUnique({
    where: { id },
    include: { loan: true },
  });
  if (!period || period.loan.userId !== userId) {
    return { error: "Dönem bulunamadı" };
  }

  // Son dönem silinirse kredi hiçbir aya taksit yazmaz; bu sessiz bir veri
  // kaybı olurdu, o yüzden engellenir.
  const count = await prisma.loanPeriod.count({
    where: { loanId: period.loanId },
  });
  if (count <= 1) {
    return {
      error: "Kredinin en az bir ödeme dönemi olmalı; krediyi silmek istersen kredi satırından sil",
    };
  }

  await prisma.loanPeriod.delete({ where: { id } });

  revalidateAll();
  return { success: true };
}

/**
 * Bir taksit ayını "ödendi" olarak işaretler ya da işareti kaldırır.
 *
 * Tamamen opsiyoneldir ve hiçbir hesabı değiştirmez: kalan borç yine
 * takvime göre hesaplanır. Amaç yalnızca elle takip.
 */
export async function toggleLoanPaidMonth(
  loanId: string,
  month: string,
  paid: boolean
): Promise<ActionState> {
  const userId = await requireUserId();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { error: "Geçersiz ay" };
  }

  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) return { error: "Kredi bulunamadı" };

  const next = paid
    ? [...new Set([...loan.paidMonths, month])]
    : loan.paidMonths.filter((m) => m !== month);

  await prisma.loan.update({
    where: { id: loanId },
    data: { paidMonths: next },
  });

  revalidateAll();
  return { success: true };
}

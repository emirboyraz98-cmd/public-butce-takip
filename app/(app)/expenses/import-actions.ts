"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isValidPaymentMonth } from "@/lib/expenses/creditCard";

type ActionState = { error?: string; success?: boolean; message?: string };

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

function revalidateAll() {
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}

/**
 * Onay kutusundaki bir kaydı gerçek gidere çevirir.
 *
 * `userId` her sorguda koşula giriyor: kimliği bilen birinin BAŞKASININ
 * kaydını onaylaması mümkün olmamalı. Sadece `findUnique(id)` deyip
 * sonradan sahiplik kontrol etmek de olurdu ama koşulu sorguya koymak
 * kontrolü atlamayı imkânsız kılıyor.
 */
export async function approveImport(
  id: string,
  input: { categoryId: string; paymentMonth: string; amount?: string }
): Promise<ActionState> {
  const userId = await requireUserId();

  const row = await prisma.importedTransaction.findFirst({
    where: { id, userId, status: "PENDING" },
  });
  if (!row) return { error: "Kayıt bulunamadı" };

  if (row.kind === "CANCELLATION") {
    return { error: "İptal kaydı gider olarak eklenemez" };
  }

  // Kur bulunamadığında tutar boş kalıyor ve kullanıcı elle giriyor.
  const rawAmount = input.amount?.trim();
  const amount = rawAmount ? new Decimal(rawAmount) : row.amount;
  if (!amount || new Decimal(amount.toString()).lte(0)) {
    return { error: "Tutar gerekli" };
  }

  const category = await prisma.expenseCategory.findFirst({
    where: { id: input.categoryId, userId },
    select: { id: true },
  });
  if (!category) return { error: "Kategori bulunamadı" };

  const date = row.occurredAt.toISOString().slice(0, 10);
  if (!isValidPaymentMonth(date, input.paymentMonth)) {
    return { error: "Ödeme ayı, harcama ayından önce olamaz" };
  }

  // Gider ile onay damgası birlikte yazılmalı: tek başına gider yazılıp
  // kayıt PENDING kalsaydı, sonraki onayda aynı harcama ikinci kez girerdi.
  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        userId,
        categoryId: category.id,
        amount: amount.toString(),
        currency: row.currency ?? "TRY",
        date: row.occurredAt,
        frequency: "ONE_TIME",
        kind: "CREDIT_CARD",
        paymentMonth: input.paymentMonth,
        installmentCount: row.installmentCount,
        // İşyeri adı mailde yok; sektör en yakın bilgi. Yurt dışı
        // harcamasında özgün tutar da nota giriyor, yoksa TL karşılığını
        // gören kullanıcı hangi kurun uygulandığını hiç bilemezdi.
        note:
          row.rawCurrency === (row.currency ?? "TRY")
            ? `${row.sector} · kart ${row.cardLast4}`
            : `${row.sector} · kart ${row.cardLast4} · ${row.rawAmount} ${row.rawCurrency}`,
      },
    });

    await tx.importedTransaction.update({
      where: { id: row.id },
      data: { status: "APPROVED", expenseId: expense.id },
    });
  });

  revalidateAll();
  return { success: true };
}

export async function rejectImport(id: string): Promise<ActionState> {
  const userId = await requireUserId();

  const { count } = await prisma.importedTransaction.updateMany({
    where: { id, userId, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  if (count === 0) return { error: "Kayıt bulunamadı" };

  revalidateAll();
  return { success: true };
}

/**
 * İptal bildirimini karşılığı olan harcamayla eşleştirip o harcamayı siler.
 *
 * Eşleşme kartın son dördü + ÖZGÜN tutar + para birimiyle aranıyor; TL
 * karşılığı üzerinden aramak yurt dışı harcamalarında kur değiştiği için
 * tutmazdı. Birden fazla aday varsa en yenisi seçilir — iptal genelde son
 * yapılan harcamaya ait.
 */
export async function applyCancellation(id: string): Promise<ActionState> {
  const userId = await requireUserId();

  const row = await prisma.importedTransaction.findFirst({
    where: { id, userId, status: "PENDING", kind: "CANCELLATION" },
  });
  if (!row) return { error: "Kayıt bulunamadı" };

  const match = await prisma.importedTransaction.findFirst({
    where: {
      userId,
      kind: "PURCHASE",
      status: "APPROVED",
      cardLast4: row.cardLast4,
      rawAmount: row.rawAmount,
      rawCurrency: row.rawCurrency,
      expenseId: { not: null },
      occurredAt: { lte: row.occurredAt },
    },
    orderBy: { occurredAt: "desc" },
  });

  if (!match?.expenseId) {
    return {
      error:
        "Eşleşen onaylanmış harcama bulunamadı. Harcamayı önce onayla ya da bu iptali sil.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.expense.deleteMany({ where: { id: match.expenseId!, userId } });
    // İptal edilen harcamanın kaydı da kapanmalı; açık kalırsa aynı iptal
    // ikinci kez uygulanıp başka bir harcamayı silebilirdi.
    await tx.importedTransaction.update({
      where: { id: match.id },
      data: { status: "REJECTED", expenseId: null },
    });
    await tx.importedTransaction.update({
      where: { id: row.id },
      data: { status: "APPROVED" },
    });
  });

  revalidateAll();
  return { success: true, message: "Harcama iptal edildi ve listeden kaldırıldı" };
}

/**
 * Elle dokunmaya gerek olmayan kayıtları topluca onaylar.
 *
 * "Gerek olmayan" = tutarı ve kategori önerisi olan alelade harcamalar.
 * Kategorisi çözülemeyenler ("Diğer"e düşenler değil, önerisi HİÇ
 * olmayanlar), tutarı boş olanlar ve iptaller dışarıda kalır: onlar zaten
 * kullanıcı kararı gerektirdiği için bu kutuda duruyorlar.
 */
export async function approveAllReady(): Promise<ActionState> {
  const userId = await requireUserId();

  const rows = await prisma.importedTransaction.findMany({
    where: {
      userId,
      status: "PENDING",
      kind: "PURCHASE",
      amount: { not: null },
      suggestedCategoryId: { not: null },
      paymentMonth: { not: null },
    },
  });

  let approved = 0;
  for (const row of rows) {
    const result = await approveImport(row.id, {
      categoryId: row.suggestedCategoryId!,
      paymentMonth: row.paymentMonth!,
    });
    if (result.success) approved += 1;
  }

  revalidateAll();
  return {
    success: true,
    message:
      approved === 0
        ? "Topluca onaylanabilecek kayıt yok"
        : `${approved} kayıt onaylandı`,
  };
}

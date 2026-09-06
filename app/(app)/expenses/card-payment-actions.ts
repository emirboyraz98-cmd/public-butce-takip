"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Bir ay için karta gerçekten ödenen tutarı kaydeder.
 *
 * Tutar boş bırakılırsa kayıt silinir ve o ay yeniden "ekstrenin tamamı
 * ödendi" varsayımına döner. Sıfır ise gerçek bir kayıttır: "bu ay hiç ödeme
 * yapmadım" demektir ve borcun tamamı devreder.
 */
export async function setCardStatementPayment(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const month = formData.get("month");
  const currency = formData.get("currency");
  const raw = formData.get("amount");

  if (typeof month !== "string" || !MONTH.test(month)) {
    return { error: "Geçersiz ay" };
  }
  if (currency !== "TRY" && currency !== "USD") {
    return { error: "Geçersiz para birimi" };
  }

  const note = typeof formData.get("note") === "string"
    ? (formData.get("note") as string).trim() || null
    : null;

  // Boş tutar = kaydı kaldır, varsayıma dön.
  if (typeof raw !== "string" || raw.trim() === "") {
    await prisma.creditCardStatementPayment.deleteMany({
      where: { userId, month, currency },
    });
    revalidateAll();
    return { success: true };
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Ödeme tutarı 0 veya daha büyük bir sayı olmalı" };
  }

  await prisma.creditCardStatementPayment.upsert({
    where: { userId_month_currency: { userId, month, currency } },
    create: { userId, month, currency, amount, note },
    update: { amount, note },
  });

  revalidateAll();
  return { success: true };
}

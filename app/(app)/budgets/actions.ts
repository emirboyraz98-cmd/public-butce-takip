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

/**
 * Kategorinin aylık bütçe sınırını yazar.
 *
 * `limit === null` sınırı kaldırır — kategori bütçe takibinden çıkar ve
 * toplamlara girmez. Sıfır ise sınır olarak KALIR: "bu kategoriye hiç
 * harcama yapmayacağım" geçerli bir hedef ve sınırın yokluğundan farklı.
 * Bu ayrım olmadan sıfır girmek sınırı silmek anlamına gelirdi.
 */
export async function setCategoryBudget(
  categoryId: string,
  limit: number | null
): Promise<ActionState> {
  const userId = await requireUserId();

  if (limit !== null) {
    if (!Number.isFinite(limit)) return { error: "Tutar sayı olmalı" };
    if (limit < 0) return { error: "Bütçe eksi olamaz" };
    // 12,2 kolonunun sınırı; üstü veritabanında sessizce hataya düşerdi.
    if (limit > 9_999_999_999) return { error: "Tutar çok büyük" };
  }

  const result = await prisma.expenseCategory.updateMany({
    where: { id: categoryId, userId },
    data: { monthlyLimit: limit },
  });
  if (result.count === 0) return { error: "Kategori bulunamadı" };

  revalidatePath("/budgets");
  revalidatePath("/expenses/categories");
  return { success: true };
}

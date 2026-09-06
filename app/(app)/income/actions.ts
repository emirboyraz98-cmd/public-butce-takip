"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { incomeEntrySchema } from "@/lib/validation/income";

type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

export async function createIncomeEntry(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = incomeEntrySchema.safeParse({
    categoryId: formData.get("categoryId"),
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    note: formData.get("note") || undefined,
    date: formData.get("date"),
    frequency: formData.get("frequency"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { categoryId, amount, currency, note, date, frequency } = parsed.data;

  const category = await prisma.incomeCategory.findFirst({
    where: { id: categoryId, userId },
  });
  if (!category) {
    return { error: "Geçersiz kategori" };
  }

  await prisma.incomeEntry.create({
    data: {
      userId,
      categoryId,
      amount,
      currency,
      note,
      date: new Date(`${date}T00:00:00Z`),
      frequency,
    },
  });

  revalidatePath("/income");
  return { success: true };
}

export async function updateIncomeEntry(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Kayıt bulunamadı" };

  const parsed = incomeEntrySchema.safeParse({
    categoryId: formData.get("categoryId"),
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    note: formData.get("note") || undefined,
    date: formData.get("date"),
    frequency: formData.get("frequency"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { categoryId, amount, currency, note, date, frequency } = parsed.data;

  // Hem kaydın hem de seçilen kategorinin bu kullanıcıya ait olduğu doğrulanır.
  const [existing, category] = await Promise.all([
    prisma.incomeEntry.findFirst({ where: { id, userId } }),
    prisma.incomeCategory.findFirst({ where: { id: categoryId, userId } }),
  ]);
  if (!existing) return { error: "Kayıt bulunamadı" };
  if (!category) return { error: "Geçersiz kategori" };

  await prisma.incomeEntry.update({
    where: { id },
    data: {
      categoryId,
      amount,
      currency,
      note: note ?? null,
      date: new Date(`${date}T00:00:00Z`),
      frequency,
    },
  });

  revalidatePath("/income");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteIncomeEntry(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  await prisma.incomeEntry.deleteMany({ where: { id, userId } });
  revalidatePath("/income");
  return { success: true };
}

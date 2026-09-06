"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { incomeCategorySchema } from "@/lib/validation/income";
import { DEFAULT_INCOME_CATEGORIES } from "@/lib/defaults";

type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

export async function createIncomeCategory(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = incomeCategorySchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const existing = await prisma.incomeCategory.findUnique({
    where: { userId_name: { userId, name: parsed.data.name } },
  });
  if (existing) {
    return { error: "Bu isimde bir kategori zaten var" };
  }

  await prisma.incomeCategory.create({
    data: { userId, name: parsed.data.name },
  });

  revalidatePath("/income/categories");
  revalidatePath("/income");
  return { success: true };
}

/** Bkz. deleteExpenseCategory — gelir tarafındaki karşılığı. */
export async function deleteIncomeCategory(
  id: string,
  moveToId?: string
): Promise<ActionState> {
  const userId = await requireUserId();

  const category = await prisma.incomeCategory.findFirst({
    where: { id, userId },
  });
  if (!category) return { error: "Kategori bulunamadı" };

  const entryCount = await prisma.incomeEntry.count({ where: { categoryId: id } });

  if (entryCount > 0) {
    if (!moveToId) {
      return {
        error: `Bu kategoride ${entryCount} kayıt var; silmeden önce başka bir kategoriye taşı`,
      };
    }
    if (moveToId === id) {
      return { error: "Kayıtlar aynı kategoriye taşınamaz" };
    }

    const target = await prisma.incomeCategory.findFirst({
      where: { id: moveToId, userId },
    });
    if (!target) return { error: "Hedef kategori bulunamadı" };

    await prisma.$transaction([
      prisma.incomeEntry.updateMany({
        where: { categoryId: id, userId },
        data: { categoryId: moveToId },
      }),
      prisma.incomeCategory.delete({ where: { id } }),
    ]);
  } else {
    await prisma.incomeCategory.delete({ where: { id } });
  }

  revalidatePath("/income/categories");
  revalidatePath("/income");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Bkz. addMissingExpenseCategories — gelir tarafındaki karşılığı. */
export async function addMissingIncomeCategories(): Promise<
  ActionState & { added?: number }
> {
  const userId = await requireUserId();

  const existing = await prisma.incomeCategory.findMany({
    where: { userId },
    select: { name: true },
  });
  const have = new Set(existing.map((c) => c.name));
  const missing = DEFAULT_INCOME_CATEGORIES.filter((name) => !have.has(name));

  if (missing.length === 0) return { success: true, added: 0 };

  await prisma.incomeCategory.createMany({
    data: missing.map((name) => ({ userId, name, isDefault: true })),
    skipDuplicates: true,
  });

  revalidatePath("/income/categories");
  revalidatePath("/income");
  return { success: true, added: missing.length };
}

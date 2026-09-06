"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { expenseCategorySchema } from "@/lib/validation/expense";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/defaults";

type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

export async function createExpenseCategory(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = expenseCategorySchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const existing = await prisma.expenseCategory.findUnique({
    where: { userId_name: { userId, name: parsed.data.name } },
  });
  if (existing) {
    return { error: "Bu isimde bir kategori zaten var" };
  }

  await prisma.expenseCategory.create({
    data: { userId, name: parsed.data.name },
  });

  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
  return { success: true };
}

/**
 * Kategoriyi siler. Kayıtlı harcaması varsa silme eskiden tamamen
 * engelleniyordu; artık `moveToId` verilerek kayıtlar başka bir kategoriye
 * taşınıp kategori silinebiliyor. Kayıt kaybı olmaz, yalnızca yeniden
 * sınıflandırılır.
 */
export async function deleteExpenseCategory(
  id: string,
  moveToId?: string
): Promise<ActionState> {
  const userId = await requireUserId();

  const category = await prisma.expenseCategory.findFirst({
    where: { id, userId },
  });
  if (!category) return { error: "Kategori bulunamadı" };

  const entryCount = await prisma.expense.count({ where: { categoryId: id } });

  if (entryCount > 0) {
    if (!moveToId) {
      return {
        error: `Bu kategoride ${entryCount} kayıt var; silmeden önce başka bir kategoriye taşı`,
      };
    }
    if (moveToId === id) {
      return { error: "Kayıtlar aynı kategoriye taşınamaz" };
    }

    const target = await prisma.expenseCategory.findFirst({
      where: { id: moveToId, userId },
    });
    if (!target) return { error: "Hedef kategori bulunamadı" };

    // Taşıma ile silme tek işlemde: yarıda kalırsa kayıtlar silinmiş bir
    // kategoriye bağlı kalırdı.
    await prisma.$transaction([
      prisma.expense.updateMany({
        where: { categoryId: id, userId },
        data: { categoryId: moveToId },
      }),
      prisma.expenseCategory.delete({ where: { id } }),
    ]);
  } else {
    await prisma.expenseCategory.delete({ where: { id } });
  }

  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Varsayılan kategori listesi zamanla genişliyor; mevcut kullanıcılar
 * yalnızca kayıt olurken oluşturulanlara sahip. Bu eylem eksik kalanları
 * ekler, var olanlara dokunmaz — kullanıcının kendi kategorileri ve
 * yeniden adlandırdıkları korunur.
 */
export async function addMissingExpenseCategories(): Promise<
  ActionState & { added?: number }
> {
  const userId = await requireUserId();

  const existing = await prisma.expenseCategory.findMany({
    where: { userId },
    select: { name: true },
  });
  const have = new Set(existing.map((c) => c.name));
  const missing = DEFAULT_EXPENSE_CATEGORIES.filter((name) => !have.has(name));

  if (missing.length === 0) return { success: true, added: 0 };

  await prisma.expenseCategory.createMany({
    data: missing.map((name) => ({ userId, name, isDefault: true })),
    skipDuplicates: true,
  });

  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
  return { success: true, added: missing.length };
}

/**
 * Kategoriyi gizler ya da yeniden gösterir.
 *
 * Silmek yerine gizlemek, o kategoriye bağlı geçmiş kayıtların etiketini
 * korur. Artık kullanılmayan bir kategori (örn. kredi taksitleri "Krediler"
 * sekmesine taşındıktan sonra kalan "Kredi Ödemesi") böylece harcama
 * formlarının seçim listesinden çıkar.
 */
export async function setExpenseCategoryArchived(
  id: string,
  archived: boolean
): Promise<ActionState> {
  const userId = await requireUserId();

  const result = await prisma.expenseCategory.updateMany({
    where: { id, userId },
    data: { archived },
  });
  if (result.count === 0) return { error: "Kategori bulunamadı" };

  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
  return { success: true };
}

"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation/auth";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from "@/lib/defaults";

export type RegisterState = {
  error?: string;
  success?: boolean;
  /** true ise hesap onay bekliyor; giriş ekranına yönlendirilmez. */
  pending?: boolean;
};

export async function registerUser(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    password: formData.get("password"),
    baseCurrency: formData.get("baseCurrency"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { name, username, password, baseCurrency } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return { error: "Bu kullanıcı adı zaten alınmış" };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // İlk kullanıcı yönetici olur ve onay beklemez: aksi halde onaylayacak
  // kimse olmadığı için sistem kilitli açılırdı.
  const isFirstUser = (await prisma.user.count()) === 0;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        username,
        passwordHash,
        baseCurrency,
        ...(isFirstUser
          ? { role: "ADMIN" as const, status: "ACTIVE" as const, approvedAt: new Date() }
          : {}),
      },
    });

    await tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((categoryName) => ({
        userId: user.id,
        name: categoryName,
        isDefault: true,
      })),
    });

    await tx.incomeCategory.createMany({
      data: DEFAULT_INCOME_CATEGORIES.map((categoryName) => ({
        userId: user.id,
        name: categoryName,
        isDefault: true,
      })),
    });
  });

  return { success: true, pending: !isFirstUser };
}

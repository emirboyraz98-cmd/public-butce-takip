"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { baseCurrencySchema } from "@/lib/validation/settings";

type ActionState = { error?: string; success?: boolean };

export async function updateBaseCurrency(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");

  const parsed = baseCurrencySchema.safeParse({
    baseCurrency: formData.get("baseCurrency"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { baseCurrency: parsed.data.baseCurrency },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

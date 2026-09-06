"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdminUserId } from "@/lib/auth/requireAdmin";

type ActionState = { error?: string; success?: boolean };

/**
 * Bir üyenin durumunu değiştirir.
 *
 * Yönetici kendi hesabını devre dışı bırakamaz ve kendi yetkisini alamaz:
 * tek yönetici kendini kilitlerse sistemi açacak kimse kalmıyor ve düzeltmek
 * için veritabanına elle girmek gerekiyor.
 */
async function setStatus(
  userId: string,
  status: "ACTIVE" | "DISABLED"
): Promise<ActionState> {
  const adminId = await requireAdminUserId();

  if (userId === adminId) {
    return { error: "Kendi hesabının durumunu değiştiremezsin" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      status,
      ...(status === "ACTIVE"
        ? { approvedAt: new Date(), approvedById: adminId }
        : {}),
    },
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function approveUser(userId: string): Promise<ActionState> {
  return setStatus(userId, "ACTIVE");
}

export async function disableUser(userId: string): Promise<ActionState> {
  return setStatus(userId, "DISABLED");
}

/**
 * Onay bekleyen bir kaydı tamamen siler.
 *
 * Yalnızca PENDING kayıtlar silinebilir: onaylanmış bir hesabın silinmesi
 * ilişkili bütün finansal veriyi de götürür (onDelete: Cascade). Erişimi
 * kesmek için "devre dışı bırak" var.
 */
export async function rejectUser(userId: string): Promise<ActionState> {
  const adminId = await requireAdminUserId();

  if (userId === adminId) {
    return { error: "Kendi hesabını silemezsin" };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (!target) return { error: "Kullanıcı bulunamadı" };
  if (target.status !== "PENDING") {
    return {
      error:
        "Yalnızca onay bekleyen kayıtlar silinebilir. Mevcut bir üyenin erişimini kesmek için 'Devre dışı bırak' kullan.",
    };
  }

  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin");
  return { success: true };
}

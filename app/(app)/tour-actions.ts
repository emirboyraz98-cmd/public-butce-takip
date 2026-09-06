"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TOURS } from "@/lib/tours/content";

type ActionState = { error?: string; success?: boolean };

/** Bir sayfanın tanıtım turunu tamamlandı olarak işaretler (tekrar gösterilmez). */
export async function completeTour(tourKey: string): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Oturum bulunamadı" };

  // Yalnızca tanımlı tur anahtarları kabul edilir; dışarıdan rastgele değer
  // yazılıp dizi şişirilmesin.
  if (!(tourKey in TOURS)) return { error: "Geçersiz tur" };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { completedTours: true },
  });

  if (user.completedTours.includes(tourKey)) return { success: true };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { completedTours: { set: [...user.completedTours, tourKey] } },
  });

  return { success: true };
}

/** Tüm turları sıfırlar; kullanıcı tanıtımı baştan görmek isterse. */
export async function resetTours(): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Oturum bulunamadı" };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { completedTours: { set: [] } },
  });

  return { success: true };
}

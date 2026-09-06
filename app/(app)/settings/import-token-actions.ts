"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateImportToken } from "@/lib/import/token";

type TokenState = {
  error?: string;
  /** Yalnızca üretildiği anda döner; bir daha gösterilemez. */
  plaintext?: string;
};

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

/**
 * Yeni bir aktarım anahtarı üretir.
 *
 * Anahtarın düz hâli SADECE bu dönüşte var; veritabanına özeti yazılıyor.
 * Kullanıcı kopyalamayı kaçırırsa yenisini üretip Apps Script'i günceller —
 * kayıp bir anahtarı geri getirmek, saklanmasını gerektirirdi.
 */
export async function createImportToken(label?: string): Promise<TokenState> {
  const userId = await requireUserId();

  const open = await prisma.importToken.count({
    where: { userId, revokedAt: null },
  });
  // Sınır güvenlik değil düzen için: her "yeniden üret"te bir öncekini
  // kapatmayan kullanıcıda geçerli anahtarlar birikiyor ve hangisinin
  // nerede kullanıldığı takip edilemez hale geliyor.
  if (open >= 5) {
    return { error: "Çok fazla etkin anahtar var; önce kullanmadıklarını iptal et" };
  }

  const row = await prisma.importToken.create({
    data: { userId, secretHash: "", label: label?.trim() || null },
  });
  const { plaintext, secretHash } = generateImportToken(row.id);
  await prisma.importToken.update({ where: { id: row.id }, data: { secretHash } });

  revalidatePath("/settings");
  return { plaintext };
}

/**
 * Anahtarı iptal eder. Satır silinmiyor: hangi anahtarın ne zaman
 * kapatıldığı kayıtta kalsın diye yalnızca `revokedAt` doluyor.
 */
export async function revokeImportToken(id: string): Promise<{ error?: string }> {
  const userId = await requireUserId();

  const { count } = await prisma.importToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return { error: "Anahtar bulunamadı" };

  revalidatePath("/settings");
  return {};
}

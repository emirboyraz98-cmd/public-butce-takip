import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Yönetici yetkisini oturumdaki role DEĞİL veritabanına bakarak doğrular.
 *
 * Rol JWT'de de taşınıyor (menüyü göstermek için yeterli), ama yetki kararı
 * ona dayandırılamaz: token giriş anında üretiliyor, dolayısıyla rolü sonradan
 * alınan biri token'ı süresi dolana kadar yönetici kalırdı.
 *
 * Aynı sebeple durum da kontrol edilir — devre dışı bırakılan bir yönetici
 * elindeki oturumla çalışmaya devam edemesin.
 */
export async function requireAdminUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, status: true },
  });

  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") {
    throw new Error("Bu işlem için yönetici yetkisi gerekiyor");
  }

  return session.user.id;
}

/** Sayfa korumasında kullanılır; fırlatmak yerine boolean döner. */
export async function isAdmin(): Promise<boolean> {
  try {
    await requireAdminUserId();
    return true;
  } catch {
    return false;
  }
}

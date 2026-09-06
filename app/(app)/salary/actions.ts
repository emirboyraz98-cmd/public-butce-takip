"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { actualPaymentSchema, markDaysSchema } from "@/lib/validation/salary";
import { dayTypeForMark } from "@/lib/salary/markDays";
import { toDateKey } from "@/lib/salary/holidayCalendar";
import { safeRecompute } from "@/lib/salary/recomputeNotice";

type ActionState = {
  error?: string;
  success?: boolean;
  warning?: string;
  /** Sorun değil ama kullanıcının görmesi gereken sonuç (örn. silinen aylar). */
  info?: string;
};

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

/**
 * Takvimde seçilen günleri işaretler — uygulamadaki tek çalışma günü girişi.
 *
 * `WORKED` seçimde her günün tipi ayrı belirlenir: pazarlar pazar, resmi
 * tatiller tatil, kalanlar normal gün. Kaldırılan çalışma dönemleri de aynen
 * böyle davranıyordu; seçime düz `NORMAL` yazmak, bir ayı seçip "Çalışıldı"
 * diyen kullanıcının pazar katsayısını (22.5 → 11.25) sessizce yok ederdi.
 *
 * Tek tek `upsert` yerine toplu yazma: her yazma maaşı baştan hesaplıyordu ve
 * yirmi günlük bir seçimde bu yirmi kez oluyordu. Burada yazma toplu,
 * hesaplama bir kez.
 */
export async function markDays(
  dates: string[],
  mark: string
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = markDaysSchema.safeParse({ dates, mark });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const holidayDateKeys = new Set(
    (await prisma.publicHoliday.findMany()).map((h) => toDateKey(h.date))
  );

  const rows = parsed.data.dates.map((iso) => {
    const date = new Date(`${iso}T00:00:00Z`);
    return {
      userId,
      date,
      dayType: dayTypeForMark(date, parsed.data.mark, holidayDateKeys),
    };
  });

  await prisma.$transaction([
    // Önce sil sonra yaz: `upsert` çoklu kayıt almıyor ve gün başına bir
    // sorgu, yirmi günlük seçimde kırk gidiş-geliş demekti.
    prisma.salaryDayException.deleteMany({
      where: { userId, date: { in: rows.map((r) => r.date) } },
    }),
    prisma.salaryDayException.createMany({ data: rows }),
  ]);

  const notice = await safeRecompute(userId);
  revalidatePath("/salary");
  return { success: true, ...notice };
}

/**
 * Seçilen günlerin işaretini siler; günler "Boş"a döner ve maaşa hiç
 * katılmaz. Kaldırılan dönem tablosundaki "Sil" düğmesinin karşılığı —
 * bir aralığı geri almanın tek yolu bu.
 */
export async function clearDays(dates: string[]): Promise<ActionState> {
  const userId = await requireUserId();
  if (dates.length === 0) return { error: "En az bir gün seç" };

  await prisma.salaryDayException.deleteMany({
    where: {
      userId,
      date: { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) },
    },
  });

  const notice = await safeRecompute(userId);
  revalidatePath("/salary");
  return { success: true, ...notice };
}

export async function setActualPayment(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const rawAmount = formData.get("actualAmount");
  const parsed = actualPaymentSchema.safeParse({
    month: formData.get("month"),
    actualAmount: rawAmount ? Number(rawAmount) : null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  await prisma.monthlySalaryResult.update({
    where: { userId_month: { userId, month: parsed.data.month } },
    data: { actualAmount: parsed.data.actualAmount },
  });

  revalidatePath("/salary");
  return { success: true };
}

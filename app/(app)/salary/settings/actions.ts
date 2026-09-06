"use server";

import { revalidatePath } from "next/cache";
import { endOfMonth } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  baseSalaryRateSchema,
  referenceFxRateSchema,
} from "@/lib/validation/salary";
import { resolveOverlaps } from "@/lib/salary/effectiveRate";
import { joinInfo, safeRecompute } from "@/lib/salary/recomputeNotice";

type ActionState = { error?: string; success?: boolean; warning?: string; info?: string };

function overlapInfoMessage(changed: number): string | undefined {
  if (changed === 0) return undefined;
  return changed === 1
    ? "Çakışan bir dönem, bu yeni döneme yol verecek şekilde otomatik güncellendi."
    : `Çakışan ${changed} dönem, bu yeni döneme yol verecek şekilde otomatik güncellendi.`;
}

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

/** "YYYY-MM" ayın ilk gününe çevrilir. */
function monthStartDate(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

/** "YYYY-MM" ayın son gününe çevrilir (dönem, seçilen son ayın tamamını kapsasın diye). */
function monthEndDate(month: string): Date {
  return endOfMonth(monthStartDate(month));
}

export async function createBaseSalaryRate(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = baseSalaryRateSchema.safeParse({
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    mode: formData.get("mode"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { amount, currency, mode, effectiveFrom, effectiveTo } = parsed.data;
  const editingId = formData.get("id");
  const newPeriod = {
    effectiveFrom: monthStartDate(effectiveFrom),
    effectiveTo: effectiveTo ? monthEndDate(effectiveTo) : null,
  };

  const existingRates = await prisma.baseSalaryRate.findMany({
    where: { userId, ...(editingId ? { id: { not: String(editingId) } } : {}) },
  });
  const { deleteIds, updates, creates } = resolveOverlaps(existingRates, newPeriod);

  await prisma.$transaction([
    ...deleteIds.map((id) => prisma.baseSalaryRate.delete({ where: { id } })),
    ...updates.map((u) =>
      prisma.baseSalaryRate.update({
        where: { id: u.id },
        data: { effectiveFrom: u.effectiveFrom, effectiveTo: u.effectiveTo },
      })
    ),
    ...creates.map((c) =>
      prisma.baseSalaryRate.create({
        data: {
          userId,
          amount: c.source.amount,
          currency: c.source.currency,
          // Bölünen dönemin kuyruğu kendi türünü korumalı: yeni dönemin
          // türünü kopyalasaydık, araya sabit bir dönem sokan kullanıcının
          // ondan SONRAKİ değişken ayları da sabite dönerdi.
          mode: c.source.mode,
          effectiveFrom: c.effectiveFrom,
          effectiveTo: c.effectiveTo,
        },
      })
    ),
    editingId
      ? prisma.baseSalaryRate.update({
          where: { id: String(editingId), userId },
          data: { amount, currency, mode, ...newPeriod },
        })
      : prisma.baseSalaryRate.create({
          data: { userId, amount, currency, mode, ...newPeriod },
        }),
  ]);

  const notice = await safeRecompute(userId);
  revalidatePath("/salary/settings");
  revalidatePath("/salary");
  return {
    success: true,
    warning: notice.warning,
    info: joinInfo(overlapInfoMessage(deleteIds.length + updates.length), notice.info),
  };
}

export async function deleteBaseSalaryRate(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  await prisma.baseSalaryRate.deleteMany({ where: { id, userId } });
  const notice = await safeRecompute(userId);
  revalidatePath("/salary/settings");
  revalidatePath("/salary");
  return { success: true, ...notice };
}

export async function createReferenceFxRate(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = referenceFxRateSchema.safeParse({
    rate: Number(formData.get("rate")),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { rate, effectiveFrom, effectiveTo } = parsed.data;
  const editingId = formData.get("id");
  const newPeriod = {
    effectiveFrom: monthStartDate(effectiveFrom),
    effectiveTo: effectiveTo ? monthEndDate(effectiveTo) : null,
  };

  const existingRates = await prisma.referenceFxRate.findMany({
    where: { userId, ...(editingId ? { id: { not: String(editingId) } } : {}) },
  });
  const { deleteIds, updates, creates } = resolveOverlaps(existingRates, newPeriod);

  await prisma.$transaction([
    ...deleteIds.map((id) => prisma.referenceFxRate.delete({ where: { id } })),
    ...updates.map((u) =>
      prisma.referenceFxRate.update({
        where: { id: u.id },
        data: { effectiveFrom: u.effectiveFrom, effectiveTo: u.effectiveTo },
      })
    ),
    ...creates.map((c) =>
      prisma.referenceFxRate.create({
        data: {
          userId,
          rate: c.source.rate,
          effectiveFrom: c.effectiveFrom,
          effectiveTo: c.effectiveTo,
        },
      })
    ),
    editingId
      ? prisma.referenceFxRate.update({
          where: { id: String(editingId), userId },
          data: { rate, ...newPeriod },
        })
      : prisma.referenceFxRate.create({
          data: { userId, rate, ...newPeriod },
        }),
  ]);

  const notice = await safeRecompute(userId);
  revalidatePath("/salary/settings");
  revalidatePath("/salary");
  return {
    success: true,
    warning: notice.warning,
    info: joinInfo(overlapInfoMessage(deleteIds.length + updates.length), notice.info),
  };
}

export async function deleteReferenceFxRate(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  await prisma.referenceFxRate.deleteMany({ where: { id, userId } });
  const notice = await safeRecompute(userId);
  revalidatePath("/salary/settings");
  revalidatePath("/salary");
  return { success: true, ...notice };
}

/**
 * Maaşın hak edildiği aydan kaç ay sonra ödendiğini kaydeder. Genel Bakış
 * nakit akışını gösterdiği için maaşı bu kadar ileri kaydırır; Maaş sekmesi
 * hak edişi göstermeye devam eder.
 */
export async function setSalaryPaymentOffset(
  offset: number
): Promise<ActionState> {
  const userId = await requireUserId();

  if (!Number.isInteger(offset) || offset < 0 || offset > 3) {
    return { error: "Ödeme gecikmesi 0 ile 3 ay arasında olmalı" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { salaryPaymentMonthOffset: offset },
  });

  revalidatePath("/salary/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

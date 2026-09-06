"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  manualPriceSchema,
  transactionSchema,
  transactionUpdateSchema,
} from "@/lib/validation/investments";
import { refreshPrice } from "@/lib/investments/priceCache";

type ActionState = { error?: string; success?: boolean; info?: string };

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum bulunamadı");
  return session.user.id;
}

function readTransactionForm(formData: FormData) {
  return {
    symbol: formData.get("symbol"),
    assetType: formData.get("assetType"),
    side: formData.get("side"),
    quantity: Number(formData.get("quantity")),
    pricePerUnit: Number(formData.get("pricePerUnit")),
    currency: formData.get("currency"),
    tradedAt: formData.get("tradedAt"),
    note: (formData.get("note") as string | null) || null,
    isOpening: formData.get("isOpening") === "true",
    // Alan yoksa true: eski davranış ve alış satırlarının varsayılanı.
    proceedsWithdrawn: formData.get("proceedsWithdrawn") !== "false",
  };
}

/**
 * Bir satışın, o ana kadar elde bulunan adetten fazla olup olmadığını
 * denetler. `excludeId` düzenleme sırasında kaydın kendisini hesaba
 * katmamak için kullanılır.
 */
async function availableQuantity(
  userId: string,
  symbol: string,
  assetType: string,
  currency: string,
  excludeId?: string
): Promise<number> {
  const rows = await prisma.investmentTransaction.findMany({
    where: {
      userId,
      symbol,
      assetType: assetType as never,
      currency: currency as never,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { side: true, quantity: true },
  });

  return rows.reduce(
    (total, r) =>
      r.side === "BUY"
        ? total + Number(r.quantity)
        : total - Number(r.quantity),
    0
  );
}

export async function createTransaction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = transactionSchema.safeParse(readTransactionForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { symbol, assetType, side, quantity, pricePerUnit, currency, tradedAt, note, isOpening, proceedsWithdrawn } =
    parsed.data;

  if (side === "SELL") {
    const available = await availableQuantity(userId, symbol, assetType, currency);
    if (quantity > available) {
      return {
        error: `${symbol} için elde ${available} adet var, ${quantity} adet satılamaz.`,
      };
    }
  }

  await prisma.investmentTransaction.create({
    data: {
      userId,
      symbol,
      assetType,
      side,
      quantity,
      pricePerUnit,
      currency,
      tradedAt: new Date(`${tradedAt}T00:00:00Z`),
      note,
      // Satış bir açılış kaydı olamaz: satıştan gelen para her zaman gerçek
      // bir nakit girişidir, alım uygulama dışında yapılmış olsa bile.
      isOpening: side === "BUY" && Boolean(isOpening),
      // Yalnızca satışta anlamlı; alış satırlarında her zaman true kalıyor
      // ki serbest nakit hesabı alış tarafını yanlışlıkla okumasın.
      proceedsWithdrawn: side === "SELL" ? proceedsWithdrawn !== false : true,
    },
  });

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateTransaction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = transactionUpdateSchema.safeParse({
    id: formData.get("id"),
    ...readTransactionForm(formData),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { id, symbol, assetType, side, quantity, pricePerUnit, currency, tradedAt, note, isOpening, proceedsWithdrawn } =
    parsed.data;

  const existing = await prisma.investmentTransaction.findFirst({
    where: { id, userId },
  });
  if (!existing) return { error: "İşlem bulunamadı" };

  if (side === "SELL") {
    const available = await availableQuantity(userId, symbol, assetType, currency, id);
    if (quantity > available) {
      return {
        error: `${symbol} için elde ${available} adet var, ${quantity} adet satılamaz.`,
      };
    }
  }

  await prisma.investmentTransaction.update({
    where: { id },
    data: {
      symbol,
      assetType,
      side,
      quantity,
      pricePerUnit,
      currency,
      tradedAt: new Date(`${tradedAt}T00:00:00Z`),
      note,
      // Satış bir açılış kaydı olamaz: satıştan gelen para her zaman gerçek
      // bir nakit girişidir, alım uygulama dışında yapılmış olsa bile.
      isOpening: side === "BUY" && Boolean(isOpening),
      // Yalnızca satışta anlamlı; alış satırlarında her zaman true kalıyor
      // ki serbest nakit hesabı alış tarafını yanlışlıkla okumasın.
      proceedsWithdrawn: side === "SELL" ? proceedsWithdrawn !== false : true,
    },
  });

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteTransaction(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  await prisma.investmentTransaction.deleteMany({ where: { id, userId } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function refreshAllPrices(): Promise<
  ActionState & { refreshed?: number; failed?: string[] }
> {
  const userId = await requireUserId();

  const rows = await prisma.investmentTransaction.findMany({
    where: { userId },
    distinct: ["symbol", "assetType"],
    select: { symbol: true, assetType: true },
  });

  const failed: string[] = [];
  let refreshed = 0;

  for (const r of rows) {
    if (r.assetType === "MANUAL") continue;
    try {
      await refreshPrice(r.symbol, r.assetType);
      refreshed += 1;
    } catch {
      failed.push(r.symbol);
    }
  }

  revalidatePath("/investments");
  return { success: true, refreshed, failed };
}

export async function setManualPrice(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireUserId();

  const parsed = manualPriceSchema.safeParse({
    symbol: formData.get("symbol"),
    price: Number(formData.get("price")),
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { symbol, price, currency } = parsed.data;

  await prisma.priceSnapshot.upsert({
    where: { symbol_assetType: { symbol, assetType: "MANUAL" } },
    create: { symbol, assetType: "MANUAL", price, currency, source: "manual" },
    update: { price, currency, source: "manual", fetchedAt: new Date() },
  });

  revalidatePath("/investments");
  return { success: true };
}

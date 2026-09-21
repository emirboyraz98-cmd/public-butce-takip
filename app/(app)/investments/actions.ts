"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  cashMovementSchema,
  manualPriceSchema,
  transactionSchema,
  transactionUpdateSchema,
} from "@/lib/validation/investments";
import { refreshPrice } from "@/lib/investments/priceCache";
import { freeCashBalance } from "@/lib/investments/cashFlow";
import { convert, type Currency } from "@/lib/fx/convert";
import { formatMoney } from "@/lib/format";

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

/**
 * Bir tarih itibarıyla yatırım hesabındaki serbest nakit — baz para
 * biriminde.
 *
 * Çekim doğrulaması için gerekiyor: BUGÜNKÜ bakiyeye bakmak, araya giren
 * alımları görmezden gelip geçmişe olmayan bir para çekimi yazılmasına izin
 * verirdi.
 *
 * Kur YALNIZCA veride gerçekten geçen para birimleri için isteniyor. Önce
 * hem TRY hem USD kuru isteniyordu; her şeyin TRY olduğu bir hesapta bile
 * USD kuruna ulaşılamayınca doğrulama sessizce atlanıyor ve olmayan para
 * çekilebiliyordu. Gereken bir kur gerçekten alınamazsa `null` dönülür ve
 * doğrulama atlanır — kur yüzünden kayıt girilememesi, kırpmayla idare
 * etmekten daha kötü.
 */
async function freeCashAt(
  userId: string,
  until: Date,
  requestCurrency: Currency
): Promise<{ available: Decimal; baseCurrency: Currency } | null> {
  const [user, transactions, movements] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true },
    }),
    prisma.investmentTransaction.findMany({ where: { userId } }),
    prisma.investmentCashMovement.findMany({ where: { userId } }),
  ]);

  const baseCurrency = user.baseCurrency;
  const needed = new Set<Currency>([
    requestCurrency,
    ...transactions.map((t) => t.currency),
    ...movements.map((m) => m.currency),
  ]);

  const rates = new Map<Currency, Decimal>();
  for (const currency of needed) {
    const rate = await convert(1, currency, baseCurrency).catch(() => null);
    if (rate === null) return null;
    rates.set(currency, rate);
  }

  const toBase = (amount: Decimal, currency: string) =>
    new Decimal(amount).mul(rates.get(currency as Currency) ?? 1);

  const available = freeCashBalance({
    transactions: transactions.map((t) => ({
      symbol: t.symbol,
      assetType: t.assetType,
      side: t.side,
      quantity: new Decimal(t.quantity.toString()),
      pricePerUnit: new Decimal(t.pricePerUnit.toString()),
      currency: t.currency,
      tradedAt: t.tradedAt,
      createdAt: t.createdAt,
      isOpening: t.isOpening,
      proceedsWithdrawn: t.proceedsWithdrawn,
    })),
    cashMovements: movements.map((m) => ({
      direction: m.direction,
      amount: new Decimal(m.amount.toString()),
      currency: m.currency,
      occurredAt: m.occurredAt,
    })),
    toBase,
    until,
  });

  return { available, baseCurrency };
}

export async function createCashMovement(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = cashMovementSchema.safeParse({
    direction: formData.get("direction"),
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    occurredAt: formData.get("occurredAt"),
    note: (formData.get("note") as string | null) || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi" };
  }

  const { direction, amount, currency, occurredAt, note } = parsed.data;
  const occurredDate = new Date(occurredAt);

  /*
   * Olmayan para çekilemez. Hesap kırpmayı zaten yapıyor ama sessizce:
   * kullanıcı 5.000 yazıp 800 çekilmiş görürdü ve nedenini anlamazdı.
   * Burada açıkça reddedip mevcut tutarı söylüyoruz.
   */
  if (direction === "WITHDRAWAL") {
    const balance = await freeCashAt(userId, occurredDate, currency);

    if (balance !== null) {
      const requested = await convert(
        amount,
        currency,
        balance.baseCurrency
      ).catch(() => null);

      if (requested !== null && new Decimal(requested).greaterThan(balance.available)) {
        return {
          error:
            balance.available.isZero()
              ? "O tarihte yatırım hesabında çekilecek serbest nakit yoktu. Satışı girerken \u201cParayı hesabıma çektim\u201d kutusunu işaretlediysen para zaten cebine yazılmıştır."
              : `O tarihte yatırım hesabında ${formatMoney(balance.available.toFixed(2), balance.baseCurrency)} serbest nakit vardı; daha fazlası çekilemez.`,
        };
      }
    }
  }

  await prisma.investmentCashMovement.create({
    data: {
      userId,
      direction,
      amount,
      currency,
      occurredAt: occurredDate,
      note,
    },
  });

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { success: true };
}

export async function deleteCashMovement(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  await prisma.investmentCashMovement.deleteMany({ where: { id, userId } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { success: true };
}

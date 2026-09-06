import Decimal from "decimal.js";

import { statementMonthFor } from "@/lib/expenses/creditCard";
import type { AkbankParsedTransaction } from "./akbank";

/**
 * Türkiye 2016'dan beri kalıcı olarak UTC+3; yaz saati uygulaması yok.
 * Sabit ofset bu yüzden güvenli ve `Intl` kurulumuna bağımlılık getirmiyor.
 */
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Mailin geldiği anı Türkiye takvimindeki güne çevirir.
 *
 * UTC'yi olduğu gibi kullanmak gece yapılan harcamaları bir gün geriye
 * atardı: 16 Ağustos 23:30 (TR) UTC'de 16 Ağustos 20:30 değil, 23:30 TR =
 * 20:30 UTC — ama 17 Ağustos 01:00 (TR) UTC'de hâlâ 16 Ağustos'tur. Gün
 * kayması hem harcama ayını hem de ekstre ayını yanlış tarafa düşürebilir,
 * çünkü kesim günü ay ortasında.
 */
export function turkeyDateKey(instant: Date): string {
  return new Date(instant.getTime() + TURKEY_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export type ImportRowInput = {
  transaction: AkbankParsedTransaction;
  /** Mailin gönderilme anı. */
  receivedAt: Date;
  /** Kullanıcının baz para birimi. */
  baseCurrency: "TRY" | "USD";
  /** Ekstrenin kesildiği gün (1-28). */
  statementDay: number;
  /**
   * rawCurrency → baseCurrency kuru. Bulunamadıysa null; o zaman tutar boş
   * bırakılır ve kullanıcı onay kutusunda elle girer. Uydurma kurla kayıt
   * açmak, eksik kayıttan daha kötü: yanlış tutar sessizce grafiklere girer.
   */
  fxRate: Decimal | null;
};

export type ImportRow = {
  externalId: string;
  occurredAt: Date;
  rawAmount: string;
  rawCurrency: string;
  amount: string | null;
  currency: "TRY" | "USD" | null;
  fxRate: string | null;
  sector: string;
  cardLast4: string;
  installmentCount: number;
  kind: "PURCHASE" | "CANCELLATION";
  paymentMonth: string;
};

export function buildImportRow(
  externalId: string,
  input: ImportRowInput
): ImportRow {
  const { transaction: tx, receivedAt, baseCurrency, statementDay } = input;

  const dateKey = turkeyDateKey(receivedAt);
  const raw = new Decimal(tx.amount);

  // Aynı para birimindeyse çevrim yok: 1'e bölüp çarpmak kuruş oynatabilirdi.
  const sameCurrency = tx.currency === baseCurrency;
  const rate = sameCurrency ? new Decimal(1) : input.fxRate;

  return {
    externalId,
    // Gün Türkiye takviminde belirlendi; UTC gece yarısına sabitliyoruz ki
    // veritabanındaki DATE sütunu okuyan tarafın saat diliminde kaymasın.
    occurredAt: new Date(`${dateKey}T00:00:00.000Z`),
    rawAmount: raw.toFixed(2),
    rawCurrency: tx.currency,
    amount: rate ? raw.mul(rate).toDecimalPlaces(2).toFixed(2) : null,
    currency: rate ? baseCurrency : null,
    fxRate: rate ? rate.toString() : null,
    sector: tx.sector,
    cardLast4: tx.cardLast4,
    installmentCount: tx.installmentCount,
    kind: tx.kind,
    paymentMonth: statementMonthFor(dateKey, statementDay),
  };
}

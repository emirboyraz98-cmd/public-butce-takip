import Decimal from "decimal.js";

import { monthSequence } from "@/lib/date/months";

// Defterin devir zinciri kesintisiz olmalı: harcaması olmayan bir ay
// atlanırsa o ayda devreden borç kaybolur.
export { monthSequence };

/**
 * Kredi kartı ekstre defteri.
 *
 * Uygulamanın ilk hali "her ay ekstrenin tamamı ödenir" varsayıyordu; kayıtlı
 * harcama = cepten çıkan para. Asgari ödeme bu varsayımı kırar: ödenmeyen
 * kısım karta borç olarak kalır ve sonraki ayın ödenecek tutarına eklenir.
 *
 * Ay bazında zincir:
 *
 *   ödenecek(M)  = devreden(M-1) + ekstre(M)
 *   ödenen(M)    = kullanıcı girdiyse o tutar, girmediyse ödenecek(M)
 *   devreden(M)  = ödenecek(M) - ödenen(M)
 *
 * Ödeme kaydı olmayan aylarda tamamı ödenmiş sayıldığı için devreden sıfır
 * kalır — yani hiçbir şey girilmediğinde davranış eskisiyle birebir aynıdır.
 *
 * Faiz/gecikme ücreti bilerek modellenmiyor.
 */

export type LedgerInput = {
  /** Kronolojik sıralı aylar (yyyy-MM). Devir zinciri bu sırayla kurulur. */
  months: readonly string[];
  /** Ay -> o ayın ekstre tutarı (taksitler dahil). */
  statementByMonth: ReadonlyMap<string, Decimal>;
  /** Ay -> kullanıcının girdiği gerçek ödeme. Yoksa tamamı ödenmiş sayılır. */
  paymentByMonth: ReadonlyMap<string, Decimal>;
};

export type LedgerRow = {
  month: string;
  /** Önceki aydan devreden borç (negatife düşmez, bkz. aşağıdaki not). */
  openingBalance: Decimal;
  /** Bu ayın harcamalarından oluşan ekstre. */
  statement: Decimal;
  /** Bu ay ödenmesi gereken: devreden + ekstre. */
  due: Decimal;
  /** Nakit akışına yazılacak tutar. */
  paid: Decimal;
  /** Ödeme kullanıcı tarafından mı girildi (yoksa varsayım). */
  isActual: boolean;
  /** Ödemeden sonra kalan borç; eksi ise fazla ödeme. */
  closingBalance: Decimal;
};

/**
 * Devreden borç sonraki aya taşınır. Eksi bakiye (ödemenin kayıtlı borcu
 * aşması) sonraki ayın borcundan DÜŞÜLMEZ: pratikte bu neredeyse her zaman
 * eksik harcama kaydı anlamına gelir, gerçek bir alacak değil. Eksi bakiye
 * yine de `closingBalance`'ta görünür ve arayüz bunu uyarı olarak gösterir.
 */
function carryForward(closing: Decimal): Decimal {
  return closing.isNegative() ? new Decimal(0) : closing;
}

export function buildLedger({
  months,
  statementByMonth,
  paymentByMonth,
}: LedgerInput): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let carry = new Decimal(0);

  for (const month of months) {
    const statement = statementByMonth.get(month) ?? new Decimal(0);
    const due = carry.plus(statement);

    const recorded = paymentByMonth.get(month);
    const isActual = recorded !== undefined;
    const paid = recorded ?? due;
    const closingBalance = due.minus(paid);

    rows.push({
      month,
      openingBalance: carry,
      statement,
      due,
      paid,
      isActual,
      closingBalance,
    });

    carry = carryForward(closingBalance);
  }

  return rows;
}

export type AssumedAfterCarry = { month: string; carried: Decimal };

/**
 * Devreden borcu olduğu hâlde ödemesi girilmemiş aylar.
 *
 * Ödeme girilmeyen ayda "tamamı ödendi" varsayılıyor. Normal bir ayda bu
 * isabetli, ama önceki aydan borç devretmişse riskli: kullanıcı o ay da
 * eksik ödeyip girmeyi unuttuysa uygulama borcun kapandığını sanır ve devir
 * zinciri sessizce kopar — o noktadan sonraki bütün aylar yanlış olur.
 *
 * `throughMonth` dahil olmak üzere geçmiş aylara bakılır; içinde bulunulan
 * ve gelecek aylarda ödeme henüz yapılmamış olabileceği için uyarılmaz.
 */
export function assumedPaymentsAfterCarry(
  rows: readonly LedgerRow[],
  throughMonth: string
): AssumedAfterCarry[] {
  return rows
    .filter(
      (row) =>
        !row.isActual &&
        row.openingBalance.greaterThan(0) &&
        row.month <= throughMonth
    )
    .map((row) => ({ month: row.month, carried: row.openingBalance }));
}

/** Defteri aya göre aramak için. */
export function ledgerByMonth(
  rows: readonly LedgerRow[]
): Map<string, LedgerRow> {
  return new Map(rows.map((row) => [row.month, row]));
}

/**
 * Ödeme ile ekstre arasındaki fark. Nakit akışında kart kalemi gerçekleşen
 * ödemeyi gösterirken kategori listesi yalnızca kayıtlı harcamaları
 * gösterdiğinden, iki rakamın tutması için bu farkın ayrı bir satır olarak
 * yazılması gerekir.
 */
export function reconciliationGap(row: LedgerRow): Decimal {
  return row.paid.minus(row.statement);
}

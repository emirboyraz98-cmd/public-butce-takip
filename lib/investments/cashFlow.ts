import Decimal from "decimal.js";

import { derivePositions, type TransactionLike } from "./positions";

/**
 * Yatırımın nakit akışındaki yeri.
 *
 * Yatırım bir GİDER DEĞİLDİR — para harcanmaz, başka bir varlığa dönüşür ve
 * net servet değişmez. Ama bir NAKİT HAREKETİDİR: hesaptan para çıkar. Bu
 * yüzden nakit akışına girer, "harcama alışkanlığı" dağılımına girmez.
 *
 * Ay içindeki alım ve satımlar NETLEŞTİRİLİR. Brüt göstermek (300 bin satış
 * + 400 bin alım) sütunları paranın kendi içinde dönmesiyle şişiriyor,
 * maaş ve gerçek giderler grafiğin dibinde kayboluyordu. Netleştirilmiş hâl
 * tek soruya cevap verir: "bu ay yatırıma kendi cebimden ne koydum, ya da
 * yatırımdan ne çektim?" Net her zaman gerçek nakit değişimine eşittir.
 *
 * Satıştan doğan kâr da ayrı bir gelir kalemi olarak sayılmaz: satış hasılatı
 * zaten kârı içeriyor, ikisini ayrı ayrı yazmak kârı iki kez sayardı. Üstelik
 * kâr yeniden yatırıma gittiyse cebe hiç girmemiştir. Kâr bilgi olarak
 * balonda gösterilir.
 */

export type InvestmentTransactionLike = TransactionLike & {
  /** Uygulamaya başlamadan önce sahip olunan pozisyon. */
  isOpening?: boolean;
  /** Tutarı baz para birimine çevirmek için işlemin kendi para birimi. */
  currency: string;
  /**
   * Satışta: hasılat cebe çekildi mi. `false` ise para yatırım hesabında
   * serbest nakit olarak kalır ve nakit akışına GİRMEZ. Alışta okunmaz.
   * Belirtilmezse `true` (eski davranış).
   */
  proceedsWithdrawn?: boolean;
};

export type MonthlyInvestmentFlow = {
  /** yyyy-MM */
  month: string;
  /** O ay yapılan alımların toplamı (baz para birimi). */
  bought: Decimal;
  /** O ay yapılan satışların hasılatı (baz para birimi). */
  sold: Decimal;
  /**
   * `bought − sold`. Pozitifse cepten yatırıma para gitti, negatifse
   * yatırımdan cebe para geldi.
   */
  netInvested: Decimal;
  /** O ay satışlardan doğan net gerçekleşen kâr/zarar (bilgi amaçlı). */
  realizedPL: Decimal;
  /**
   * O ay serbest nakitten karşılanan alım tutarı. Nakit akışına girmez;
   * para zaten yatırım hesabının içindeydi.
   */
  fromFreeCash: Decimal;
};

function monthOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Tutarı baz para birimine çeviren fonksiyon (ait olduğu ayın kuruyla). */
export type ToBaseForMonth = (
  amount: Decimal,
  currency: string,
  month: string
) => Decimal;

/**
 * Her ay için yatırımın nakit etkisini hesaplar.
 *
 * Gerçekleşen kâr/zarar ortalama maliyet yöntemiyle bulunur; bunun için o
 * aya kadarki TÜM işlemler gerekir (açılış pozisyonları dahil, çünkü
 * maliyeti onlar belirler). Nakit tarafında ise açılış pozisyonları hariç
 * tutulur.
 */
export function monthlyInvestmentFlows({
  transactions,
  months,
  toBase,
}: {
  transactions: InvestmentTransactionLike[];
  months: string[];
  toBase: ToBaseForMonth;
}): Map<string, MonthlyInvestmentFlow> {
  const result = new Map<string, MonthlyInvestmentFlow>();
  for (const month of months) {
    result.set(month, {
      month,
      bought: new Decimal(0),
      sold: new Decimal(0),
      netInvested: new Decimal(0),
      realizedPL: new Decimal(0),
      fromFreeCash: new Decimal(0),
    });
  }

  /*
   * İşlemler TARİH SIRASIYLA yürütülüyor çünkü serbest nakit birikimli:
   * mayısta çekilmeden bırakılan satış, haziranda yapılan alımı fonluyor.
   * Ayları tek tek toplamak bu bağı koparırdı.
   *
   * Aralık dışındaki aylar da yürütülüyor; yalnızca sonuç yazılmıyor.
   * Aralığın başlangıcından önce biriken serbest nakit, aralık içindeki
   * alımları fonlamaya devam ediyor.
   */
  const ordered = transactions
    .filter((tx) => !tx.isOpening)
    .slice()
    .sort((a, b) => a.tradedAt.getTime() - b.tradedAt.getTime());

  let freeCash = new Decimal(0);

  for (const tx of ordered) {
    const month = monthOf(tx.tradedAt);
    const row = result.get(month);

    const amount = toBase(
      new Decimal(tx.quantity).mul(tx.pricePerUnit),
      tx.currency,
      month
    );

    if (tx.side === "BUY") {
      // Serbest nakit önce harcanıyor: o para zaten yatırım hesabının
      // içinde. Cepten çıkan yalnızca aşan kısım. Aksi halde "sattım,
      // çekmedim, yeniden aldım" senaryosu hiç olmamış bir gideri
      // nakit akışına yazıyordu.
      const covered = Decimal.min(freeCash, amount);
      freeCash = freeCash.minus(covered);
      if (row) {
        row.bought = row.bought.plus(amount.minus(covered));
        row.fromFreeCash = row.fromFreeCash.plus(covered);
      }
    } else if (tx.proceedsWithdrawn === false) {
      freeCash = freeCash.plus(amount);
    } else {
      if (row) row.sold = row.sold.plus(amount);
    }
  }

  for (const row of result.values()) {
    row.netInvested = row.bought.minus(row.sold);
  }

  for (const [month, pl] of realizedByMonth(transactions, months, toBase)) {
    const row = result.get(month);
    if (row) row.realizedPL = pl;
  }

  return result;
}

/**
 * Ay bazında gerçekleşen kâr/zarar.
 *
 * Ortalama maliyet birikimli olduğundan tek tek satışlara bakılamaz: her ay
 * sonuna kadarki toplam gerçekleşen kâr hesaplanır, aylık değer ardışık
 * farktan bulunur. Açılış pozisyonları maliyeti belirlediği için burada
 * DAHİL edilir — hariç tutulursa açılış pozisyonundan yapılan satış tamamen
 * kâr sayılırdı.
 */
function realizedByMonth(
  transactions: InvestmentTransactionLike[],
  months: string[],
  toBase: ToBaseForMonth
): Map<string, Decimal> {
  const result = new Map<string, Decimal>();
  if (months.length === 0) return result;

  let previous = cumulativeRealized(
    transactions,
    previousMonthEnd(months[0]),
    toBase
  );

  for (const month of months) {
    const current = cumulativeRealized(transactions, monthEnd(month), toBase);
    result.set(month, current.minus(previous));
    previous = current;
  }

  return result;
}

function cumulativeRealized(
  transactions: InvestmentTransactionLike[],
  until: Date,
  toBase: ToBaseForMonth
): Decimal {
  const upTo = transactions.filter((t) => t.tradedAt <= until);
  const month = monthOf(until);
  return derivePositions(upTo).reduce(
    (sum, position) =>
      sum.plus(toBase(position.realizedPL, position.currency, month)),
    new Decimal(0)
  );
}

function monthEnd(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
}

function previousMonthEnd(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 0, 23, 59, 59, 999));
}

/**
 * Yatırım hesabında bekleyen serbest nakit — bugün itibarıyla.
 *
 * Çekilmeden bırakılan satış hasılatı buraya girer, sonraki alımlar buradan
 * düşer. Sıfırın altına inmez: serbest nakitten fazlasını almak, aradaki
 * farkın cepten çıkması demek ve o kısım zaten nakit akışına yazılıyor.
 *
 * Ay bazlı akışlardan ayrı bir fonksiyon çünkü sorusu farklı: "şu an
 * yatırımda ne kadar boşta param var?" — bir aya değil ana ait.
 */
export function freeCashBalance({
  transactions,
  toBase,
}: {
  transactions: InvestmentTransactionLike[];
  toBase: ToBaseForMonth;
}): Decimal {
  const ordered = transactions
    .filter((tx) => !tx.isOpening)
    .slice()
    .sort((a, b) => a.tradedAt.getTime() - b.tradedAt.getTime());

  let freeCash = new Decimal(0);

  for (const tx of ordered) {
    const month = monthOf(tx.tradedAt);
    const amount = toBase(
      new Decimal(tx.quantity).mul(tx.pricePerUnit),
      tx.currency,
      month
    );

    if (tx.side === "BUY") {
      freeCash = Decimal.max(freeCash.minus(amount), 0);
    } else if (tx.proceedsWithdrawn === false) {
      freeCash = freeCash.plus(amount);
    }
  }

  return freeCash;
}

import Decimal from "decimal.js";

import { realizedSales, type TransactionLike } from "./positions";

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
 *
 * Alım/satımın yanında bir de TRANSFERLER var: yatırım hesabı ile cep
 * arasında, hiçbir pozisyona dokunmadan giden gelen para. Bunlar da nakit
 * hareketidir ve aynı netleştirmeye girer; ama `bought`/`sold` içine
 * karıştırılmaz, çünkü o iki alan kullanıcıya "Alım" ve "Satış" olarak
 * gösteriliyor.
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

/**
 * Bir alım/satıma bağlı OLMAYAN para hareketi: yatırım hesabı ile cep
 * arasındaki transfer.
 *
 * `proceedsWithdrawn` yalnızca satışın kendi anını anlatabiliyor. "Sattım,
 * parayı bıraktım" deyip iki ay sonra o parayı çekmenin kaydedileceği yer
 * yoktu; satışa dönüp işareti değiştirmek de parayı yanlış aya yazardı ve
 * kısmi çekimi ifade edemezdi.
 */
export type InvestmentCashMovementLike = {
  direction: "DEPOSIT" | "WITHDRAWAL";
  amount: Decimal;
  currency: string;
  occurredAt: Date;
};

export type MonthlyInvestmentFlow = {
  /** yyyy-MM */
  month: string;
  /** O ay yapılan alımların toplamı (baz para birimi). */
  bought: Decimal;
  /** O ay yapılan satışların hasılatı (baz para birimi). */
  sold: Decimal;
  /** O ay yatırım hesabına yatırılan, henüz bir alıma girmemiş para. */
  deposited: Decimal;
  /** O ay yatırım hesabından cebe çekilen, bir satışa bağlı olmayan para. */
  withdrawn: Decimal;
  /**
   * `(bought + deposited) − (sold + withdrawn)`. Pozitifse cepten yatırıma
   * para gitti, negatifse yatırımdan cebe para geldi.
   *
   * Yatırma/çekme ayrı alanlarda tutuluyor, `bought`/`sold` içine
   * karıştırılmıyor: o ikisi kullanıcıya "Alım" ve "Satış" olarak
   * gösteriliyor ve transferler alım satım değil.
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
/** Serbest nakdi hareket ettiren tek bir olay. */
type CashEvent = {
  at: Date;
  kind: "BUY" | "SELL_WITHDRAWN" | "SELL_KEPT" | "DEPOSIT" | "WITHDRAWAL";
  /** İşlemin/hareketin kendi para biriminde tutar. */
  amount: Decimal;
  currency: string;
};

/**
 * Alım/satımlarla nakit hareketlerini tek bir zaman çizgisinde birleştirir.
 *
 * Serbest nakit yol bağımlı olduğu için sıra belirleyici. AYNI GÜN içinde
 * girişler (satış, para yatırma) çıkışlardan (alım, para çekme) önce
 * işlenir; aksi halde "sabah sattım, aynı gün çektim" kaydında para henüz
 * gelmemiş sayılıp çekim kırpılırdı. Kayıt sırası tie-break olarak
 * kullanılmıyor: aynı veri her açılışta aynı sonucu vermeli.
 *
 * Açılış pozisyonları burada yok: onların parası uygulama daha yokken
 * çıkmıştır, serbest nakde de dokunmazlar.
 */
function orderedCashEvents(
  transactions: InvestmentTransactionLike[],
  cashMovements: InvestmentCashMovementLike[]
): CashEvent[] {
  const events: CashEvent[] = [];

  for (const tx of transactions) {
    if (tx.isOpening) continue;
    events.push({
      at: tx.tradedAt,
      kind:
        tx.side === "BUY"
          ? "BUY"
          : tx.proceedsWithdrawn === false
            ? "SELL_KEPT"
            : "SELL_WITHDRAWN",
      amount: new Decimal(tx.quantity).mul(tx.pricePerUnit),
      currency: tx.currency,
    });
  }

  for (const mv of cashMovements) {
    events.push({
      at: mv.occurredAt,
      kind: mv.direction,
      amount: new Decimal(mv.amount),
      currency: mv.currency,
    });
  }

  const inflowFirst = (kind: CashEvent["kind"]) =>
    kind === "BUY" || kind === "WITHDRAWAL" ? 1 : 0;

  return events.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() || inflowFirst(a.kind) - inflowFirst(b.kind)
  );
}

export function monthlyInvestmentFlows({
  transactions,
  cashMovements = [],
  months,
  toBase,
}: {
  transactions: InvestmentTransactionLike[];
  cashMovements?: InvestmentCashMovementLike[];
  months: string[];
  toBase: ToBaseForMonth;
}): Map<string, MonthlyInvestmentFlow> {
  const result = new Map<string, MonthlyInvestmentFlow>();
  for (const month of months) {
    result.set(month, {
      month,
      bought: new Decimal(0),
      sold: new Decimal(0),
      deposited: new Decimal(0),
      withdrawn: new Decimal(0),
      netInvested: new Decimal(0),
      realizedPL: new Decimal(0),
      fromFreeCash: new Decimal(0),
    });
  }

  /*
   * Olaylar TARİH SIRASIYLA yürütülüyor çünkü serbest nakit birikimli:
   * mayısta çekilmeden bırakılan satış, haziranda yapılan alımı fonluyor.
   * Ayları tek tek toplamak bu bağı koparırdı.
   *
   * Aralık dışındaki aylar da yürütülüyor; yalnızca sonuç yazılmıyor.
   * Aralığın başlangıcından önce biriken serbest nakit, aralık içindeki
   * alımları fonlamaya devam ediyor.
   */
  let freeCash = new Decimal(0);

  for (const event of orderedCashEvents(transactions, cashMovements)) {
    const month = monthOf(event.at);
    const row = result.get(month);
    const amount = toBase(event.amount, event.currency, month);

    switch (event.kind) {
      case "BUY": {
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
        break;
      }
      case "SELL_KEPT":
        freeCash = freeCash.plus(amount);
        break;
      case "SELL_WITHDRAWN":
        if (row) row.sold = row.sold.plus(amount);
        break;
      case "DEPOSIT":
        // Para cepten çıkıp yatırım hesabına girdi. Alım yapıldığında
        // tekrar sayılmaz: o alım serbest nakitten karşılanır.
        freeCash = freeCash.plus(amount);
        if (row) row.deposited = row.deposited.plus(amount);
        break;
      case "WITHDRAWAL": {
        /*
         * Olmayan para çekilemez. Aksiyon tarafında da doğrulanıyor;
         * buradaki kırpma, geçmişe dönük bir düzenleme dengeyi bozarsa
         * serbest nakdin eksiye düşmesini engelleyen son emniyet.
         */
        const taken = Decimal.min(freeCash, amount);
        freeCash = freeCash.minus(taken);
        if (row) row.withdrawn = row.withdrawn.plus(taken);
        break;
      }
    }
  }

  for (const row of result.values()) {
    row.netInvested = row.bought
      .plus(row.deposited)
      .minus(row.sold)
      .minus(row.withdrawn);
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
 * Her satış, KENDİ ayına ve kendi ayının kuruyla yazılır.
 *
 * Eskiden her ay sonuna kadarki BİRİKİMLİ kâr o ayın kuruyla çevrilip
 * ardışık farkı alınıyordu. Bunun yan etkisi vardı: hiç satış yapılmayan
 * bir ayda bile, yalnızca kur oynadığı için birikimli toplamın karşılığı
 * değişiyor ve o aya olmayan bir realize kâr/zarar düşüyordu.
 *
 * Açılış pozisyonları maliyeti belirlediği için hesaba DAHİL edilir —
 * hariç tutulursa açılış pozisyonundan yapılan satış tamamen kâr sayılırdı.
 */
function realizedByMonth(
  transactions: InvestmentTransactionLike[],
  months: string[],
  toBase: ToBaseForMonth
): Map<string, Decimal> {
  const result = new Map<string, Decimal>();
  for (const month of months) result.set(month, new Decimal(0));

  for (const sale of realizedSales(transactions)) {
    const month = monthOf(sale.tradedAt);
    const row = result.get(month);
    if (!row) continue;
    result.set(month, row.plus(toBase(sale.amount, sale.currency, month)));
  }

  return result;
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
  cashMovements = [],
  toBase,
  until,
}: {
  transactions: InvestmentTransactionLike[];
  cashMovements?: InvestmentCashMovementLike[];
  toBase: ToBaseForMonth;
  /**
   * Verilirse bakiye bu tarihin SONU itibarıyla hesaplanır. Bir çekim
   * kaydedilmeden önce "o gün gerçekten bu kadar para var mıydı?" diye
   * bakabilmek için: bugünkü bakiyeye bakmak, aradaki alımları görmezden
   * gelip geçmişe yanlış bir çekim yazılmasına izin verirdi.
   */
  until?: Date;
}): Decimal {
  let freeCash = new Decimal(0);

  for (const event of orderedCashEvents(transactions, cashMovements)) {
    if (until && event.at > until) break;

    const amount = toBase(event.amount, event.currency, monthOf(event.at));

    switch (event.kind) {
      case "BUY":
      case "WITHDRAWAL":
        freeCash = Decimal.max(freeCash.minus(amount), 0);
        break;
      case "SELL_KEPT":
      case "DEPOSIT":
        freeCash = freeCash.plus(amount);
        break;
      case "SELL_WITHDRAWN":
        break;
    }
  }

  return freeCash;
}

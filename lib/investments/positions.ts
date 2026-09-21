import Decimal from "decimal.js";

export type TradeSide = "BUY" | "SELL";

export type TransactionLike = {
  symbol: string;
  assetType: string;
  side: TradeSide;
  quantity: Decimal | number | string;
  pricePerUnit: Decimal | number | string;
  currency: string;
  tradedAt: Date;
  /**
   * Kayıt zamanı. tradedAt yalnızca gün hassasiyetinde olduğu için aynı gün
   * içindeki işlemlerin sırasını bu belirler (önce girilen önce işlenir).
   */
  createdAt?: Date;
};

export type Position = {
  symbol: string;
  assetType: string;
  currency: string;
  /** Elde kalan adet (satışlar düşülmüş). */
  quantity: Decimal;
  /** Ağırlıklı ortalama alış maliyeti (birim başına). */
  avgCostBasis: Decimal;
  /** Satışlardan gerçekleşmiş kâr/zarar. */
  realizedPL: Decimal;
  /** Bu pozisyonu oluşturan işlem sayısı. */
  transactionCount: number;
};

/**
 * Tek bir satıştan doğan gerçekleşen kâr/zarar — İŞLEMİN KENDİ para
 * biriminde ve kendi tarihiyle.
 *
 * Pozisyondaki `realizedPL` bütün satışları tek sayıda topluyor ve tarihi
 * kaybediyor. Baz para birimine çevirirken tarih gerekli: geçmişte kapanmış
 * bir işlemin kârını bugünkü kurla çevirmek, hiçbir işlem yapılmasa bile
 * geçmiş kârın kur oynadıkça değişmesine yol açıyordu.
 */
export type RealizedSale = {
  symbol: string;
  assetType: string;
  currency: string;
  tradedAt: Date;
  /** (satış fiyatı − o andaki ortalama maliyet) × satılan adet. */
  amount: Decimal;
};

function positionKey(symbol: string, assetType: string, currency: string): string {
  return `${symbol}|${assetType}|${currency}`;
}

/**
 * İşlem defterinden pozisyonları türetir (ortalama maliyet yöntemi):
 *
 * - ALIŞ: toplam maliyete eklenir, ortalama maliyet yeniden hesaplanır
 *   (ağırlıklı ortalama).
 * - SATIŞ: adetten düşülür; ortalama maliyet DEĞİŞMEZ. Gerçekleşen kâr/zarar
 *   (satış fiyatı − ortalama maliyet) × satılan adet olarak biriktirilir.
 *
 * İşlemler eskiden yeniye işlenir. tradedAt yalnızca gün hassasiyetinde
 * olduğundan, aynı güne düşen işlemlerde sıra createdAt'e göre belirlenir —
 * aksi halde çağıranın dizi sırası (sayfa en yeniden eskiye gönderiyor)
 * satışın alıştan önce işlenmesine ve satışın sessizce yok sayılmasına yol
 * açıyordu.
 */
export function derivePositions(transactions: TransactionLike[]): Position[] {
  return walkTransactions(transactions).positions;
}

/**
 * Tüm satışları, her birinin kendi tarihi ve para birimiyle döndürür.
 *
 * Pozisyonlarla AYNI yürüyüşten çıkıyor: ortalama maliyet mantığı ikinci
 * kez yazılsaydı iki hesap zamanla birbirinden sapardı.
 */
export function realizedSales(transactions: TransactionLike[]): RealizedSale[] {
  return walkTransactions(transactions).sales;
}

function walkTransactions(transactions: TransactionLike[]): {
  positions: Position[];
  sales: RealizedSale[];
} {
  const sorted = [...transactions].sort((a, b) => {
    const byTradedAt = a.tradedAt.getTime() - b.tradedAt.getTime();
    if (byTradedAt !== 0) return byTradedAt;
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  });

  const positions = new Map<string, Position>();
  const sales: RealizedSale[] = [];

  for (const tx of sorted) {
    const key = positionKey(tx.symbol, tx.assetType, tx.currency);
    const current =
      positions.get(key) ??
      ({
        symbol: tx.symbol,
        assetType: tx.assetType,
        currency: tx.currency,
        quantity: new Decimal(0),
        avgCostBasis: new Decimal(0),
        realizedPL: new Decimal(0),
        transactionCount: 0,
      } satisfies Position);

    const qty = new Decimal(tx.quantity);
    const price = new Decimal(tx.pricePerUnit);

    if (tx.side === "BUY") {
      const totalCost = current.quantity
        .mul(current.avgCostBasis)
        .plus(qty.mul(price));
      current.quantity = current.quantity.plus(qty);
      current.avgCostBasis = current.quantity.isZero()
        ? new Decimal(0)
        : totalCost.div(current.quantity);
    } else {
      // Elde olandan fazlası satılamaz; fazlası yok sayılır ki pozisyon
      // negatife düşüp sonraki hesapları bozmasın.
      const soldQty = Decimal.min(qty, current.quantity);
      const gain = price.minus(current.avgCostBasis).mul(soldQty);
      current.realizedPL = current.realizedPL.plus(gain);
      if (!soldQty.isZero()) {
        sales.push({
          symbol: tx.symbol,
          assetType: tx.assetType,
          currency: tx.currency,
          tradedAt: tx.tradedAt,
          amount: gain,
        });
      }
      current.quantity = current.quantity.minus(soldQty);
      if (current.quantity.isZero()) current.avgCostBasis = new Decimal(0);
    }

    current.transactionCount += 1;
    positions.set(key, current);
  }

  return {
    positions: [...positions.values()].sort((a, b) =>
      a.symbol.localeCompare(b.symbol)
    ),
    sales,
  };
}

/** Elde adet kalmayan (tamamen satılmış) pozisyonları ayıklar. */
export function openPositions(positions: Position[]): Position[] {
  return positions.filter((p) => p.quantity.greaterThan(0));
}

/** Tüm pozisyonların gerçekleşen kâr/zarar toplamı. */
export function totalRealizedPL(positions: Position[]): Decimal {
  return positions.reduce((sum, p) => sum.plus(p.realizedPL), new Decimal(0));
}

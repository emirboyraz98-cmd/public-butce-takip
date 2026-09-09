import Decimal from "decimal.js";

/**
 * Kart harcamalarının aylık sınıra göre durumu.
 *
 * Kategori bütçeleriyle (lib/budget/calculations) aynı fikir, tek fark
 * kırılımın olmaması: burada kartın o aydaki TOPLAM harcaması tek bir
 * sınırla karşılaştırılıyor.
 *
 * Karşılaştırılan sayı, harcamanın YAPILDIĞI aydaki toplamdır; ekstrenin
 * ödendiği ay değil. Sınır bir harcama hedefi ("bu ay kartı 40.000'den fazla
 * kullanmayayım"); ödeme ayına bakmak, ağustosta yapılan harcamayı eylül
 * hedefine yazıp hedefi anlamsızlaştırırdı.
 */
export type CardLimitStatus = {
  limit: Decimal;
  spent: Decimal;
  /** Çubuk doluluğu, 0-100 arasına kırpılmış. Aşım ayrı alanda. */
  percent: number;
  /** Kırpılmamış oran; "%180" gibi metinlerde kullanılır. */
  rawPercent: number;
  /** Sınırı aşan kısım; aşım yoksa sıfır. */
  overage: Decimal;
  /** Sınırdan geriye kalan; aşımda sıfır. */
  remaining: Decimal;
  over: boolean;
  /**
   * Sınıra yaklaşıldı mı (%80 ve üstü, henüz aşılmamış). Aşımı önceden
   * haber vermek, aştıktan sonra söylemekten daha işe yarıyor.
   */
  nearLimit: boolean;
};

const WARN_THRESHOLD = 80;

export function cardLimitStatus(
  limit: Decimal | string | number,
  spent: Decimal | string | number
): CardLimitStatus {
  const limitValue = new Decimal(limit);
  const spentValue = new Decimal(spent);

  /*
   * Sıfır sınır özel: 0 TL hedefe yapılan her harcama tam aşımdır.
   * `spent / 0` sonsuz olduğu için oran hesabı burada ayrı ele alınıyor;
   * yoksa çubuk NaN genişlikle çiziliyordu.
   */
  const rawPercent = limitValue.isZero()
    ? spentValue.greaterThan(0)
      ? 100
      : 0
    : spentValue.div(limitValue).times(100).toNumber();

  const overage = Decimal.max(spentValue.minus(limitValue), 0);
  const over = overage.greaterThan(0);

  return {
    limit: limitValue,
    spent: spentValue,
    percent: Math.max(0, Math.min(100, rawPercent)),
    rawPercent: Math.max(0, rawPercent),
    overage,
    remaining: Decimal.max(limitValue.minus(spentValue), 0),
    over,
    nearLimit: !over && rawPercent >= WARN_THRESHOLD,
  };
}

import Decimal from "decimal.js";

/**
 * Bir kategorinin aylık bütçesi ve o ayki gerçekleşmesi.
 *
 * `limit` null = kategoriye sınır konmamış. Bu, sınırın 0 olmasından farklı:
 * sıfır "bu kategoriye hiç harcama yapmayacağım" niyeti, null ise
 * kategorinin bütçe takibine hiç girmediği anlamına geliyor. Toplamlarda
 * yalnızca sınırı olanlar sayılır.
 */
export type CategoryBudgetInput = {
  categoryId: string;
  name: string;
  limit: Decimal | null;
  spent: Decimal;
};

export type CategoryBudgetRow = {
  categoryId: string;
  name: string;
  limit: Decimal | null;
  spent: Decimal;
  /**
   * Çubuğun dolulukta kullanacağı yüzde, 0-100 arasına KIRPILMIŞ. Aşım ayrı
   * bir alanla anlatılıyor; çubuğu 100'ün üstüne taşırmak, kaba sığmayan bir
   * genişlik üretiyordu.
   */
  percent: number;
  /** Sınırı aşan kısım. Aşım yoksa sıfır. */
  overage: Decimal;
  /** Sınırdan geriye kalan. Aşımda sıfır. */
  remaining: Decimal;
};

export type BudgetSummary = {
  rows: CategoryBudgetRow[];
  /** Sınırı olan kategorilerin sınır toplamı. */
  totalLimit: Decimal;
  /** Sınırı olan kategorilerin harcama toplamı. */
  totalSpent: Decimal;
  /** Sınır − harcama; negatife düşebilir (toplamda aşım). */
  totalRemaining: Decimal;
  /** Sınırı aşan kategori sayısı. */
  overCount: number;
};

/**
 * Sınırın yüzde kaçının harcandığı. Aşımda 100'ü GEÇER.
 *
 * Eskiden 100'de kırpılıyordu ve ekranda 2.200/2.000 harcanan bir kategori
 * "%100" yazıyordu; hemen altındaki "200 TRY aşım" satırıyla çelişiyordu.
 * Kırpma çubuk içindi, ama çubuk zaten kendi genişliğini spent/limit'ten
 * hesaplıyor (bkz. budget-rows Bar) — yani kırpmanın tek etkisi sayıyı
 * yanlış göstermekti.
 *
 * Sınır sıfırken oran tanımsız: 0 TL bütçeye 450 TL harcamak "%sonsuz".
 * 100 dönülüyor; 0 demek "hiç harcanmadı" olurdu ve daha yanıltıcıydı.
 */
function percentOf(spent: Decimal, limit: Decimal): number {
  if (limit.isZero()) return spent.greaterThan(0) ? 100 : 0;
  return Math.max(0, spent.div(limit).times(100).toNumber());
}

export function summarizeBudgets(
  inputs: readonly CategoryBudgetInput[]
): BudgetSummary {
  const rows: CategoryBudgetRow[] = inputs.map((input) => {
    const { limit, spent } = input;

    if (limit === null) {
      return {
        categoryId: input.categoryId,
        name: input.name,
        limit: null,
        spent,
        percent: 0,
        overage: new Decimal(0),
        remaining: new Decimal(0),
      };
    }

    const overage = Decimal.max(spent.minus(limit), 0);
    return {
      categoryId: input.categoryId,
      name: input.name,
      limit,
      spent,
      percent: percentOf(spent, limit),
      overage,
      remaining: Decimal.max(limit.minus(spent), 0),
    };
  });

  // Sınırsız kategoriler toplamın dışında: harcamalarını saymak, "bütçenin
  // %140'ı kullanıldı" gibi hiçbir sınıra dayanmayan bir oran üretirdi.
  const limited = rows.filter((r) => r.limit !== null);
  const totalLimit = limited.reduce(
    (acc, r) => acc.plus(r.limit as Decimal),
    new Decimal(0)
  );
  const totalSpent = limited.reduce((acc, r) => acc.plus(r.spent), new Decimal(0));

  return {
    rows,
    totalLimit,
    totalSpent,
    totalRemaining: totalLimit.minus(totalSpent),
    overCount: limited.filter((r) => r.overage.greaterThan(0)).length,
  };
}

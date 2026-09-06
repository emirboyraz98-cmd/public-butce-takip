import { formatMoneyWhole, formatMonth } from "@/lib/format";

export type CategoryShare = {
  category: string;
  /** Baz para birimindeki tutar (metin — Decimal hassasiyeti korunsun diye). */
  amount: string;
};

/**
 * Seçili ayın harcamalarının kategori payları.
 *
 * Pasta yerine yatay çubuk: teslimdeki düzen bu ve dar sütunda pastanın
 * açıklaması dilimlerden fazla yer kaplıyordu. Çubukta etiket, tutar ve
 * yüzde aynı satırda okunuyor.
 *
 * Yüzdeler bu listenin toplamına göre — kart, kredi ve genel giderlerin
 * tamamı dahil, yatırım hariç (yatırım harcama değil, varlık aktarımı).
 */
export function CategoryBars({
  month,
  items,
  currency,
  limit = 6,
}: {
  month: string;
  items: CategoryShare[];
  currency: string;
  /** Kaçıncıdan sonrası "Diğer" altında toplansın. */
  limit?: number;
}) {
  const withNumbers = items
    .map((i) => ({ category: i.category, amount: Number(i.amount) }))
    .filter((i) => i.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const total = withNumbers.reduce((acc, i) => acc + i.amount, 0);

  // Uzun kuyruk dar sütunu doldurup ilk sıradakileri ekran dışına itiyordu;
  // kalanlar tek satırda toplanıyor ki yüzdelerin toplamı yine 100 etsin.
  const head = withNumbers.slice(0, limit);
  const tail = withNumbers.slice(limit);
  const rows =
    tail.length > 0
      ? [
          ...head,
          {
            category: `Diğer (${tail.length})`,
            amount: tail.reduce((acc, i) => acc + i.amount, 0),
          },
        ]
      : head;

  return (
    <section className="border-border border">
      <header className="border-border border-b-2 px-4 py-3">
        <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
          Harcama dağılımı
        </h2>
        <p className="text-muted-foreground mt-0.5 text-[12px]">
          {formatMonth(month)} · {formatMoneyWhole(total, currency)}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-[13px]">
          Bu ay harcama kaydı yok.
        </p>
      ) : (
        <ul className="divide-hairline">
          {rows.map((row) => {
            const share = total > 0 ? (row.amount / total) * 100 : 0;
            return (
              <li key={row.category} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate">{row.category}</span>
                  <span className="text-muted-foreground flex-none">
                    {formatMoneyWhole(row.amount, currency)} · %
                    {Math.round(share)}
                  </span>
                </div>
                <div
                  className="bg-muted mt-1.5 h-[6px] w-full"
                  role="img"
                  aria-label={`${row.category}: yüzde ${Math.round(share)}`}
                >
                  <div
                    className="bg-foreground h-full"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sayfa başındaki istatistik şeridi.
 *
 * Ayrı ayrı kartlar yerine tek çerçeve içinde 1px çizgilerle bölünmüş
 * hücreler: teslimdeki düzen bu ve sebebi okunabilir — dört kutu arasındaki
 * boşluk, sayıların birbirinden bağımsız olduğu izlenimi veriyordu. Oysa
 * hepsi aynı ayın aynı tablosundan çıkıyor.
 *
 * Bölme çizgileri her hücrenin ÜST ve SOL kenarına çiziliyor, ızgara da bir
 * piksel yukarı-sola kaydırılıyor: ilk satırın üstü ile ilk sütunun solu
 * dış çerçevenin altına giriyor, içeride ise her sınırda tek çizgi kalıyor.
 * Böylece sütun sayısı kırılım noktalarında değiştiğinde (1 → 2 → 4)
 * çizgileri ayrıca ayarlamak gerekmiyor.
 */
export function StatStrip({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  /**
   * Geniş ekrandaki hücre sayısı. Dar ekranda her zaman 1, orta ekranda 2.
   *
   * Çağıran kaç kutu çizdiğini biliyor; sayıyı burada `Children.count` ile
   * türetmek koşullu kutularda ({flag && <Stat/>}) yanlış sonuç veriyor —
   * `false` da bir çocuk sayılıyor.
   */
  columns?: 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div className={cn("border-border overflow-hidden border", className)}>
      <div
        className={cn(
          "-mt-px -ml-px grid grid-cols-1 sm:grid-cols-2",
          // Tailwind sınıfları kaynakta tam yazılmalı; şablonla üretilen
          // `lg:grid-cols-${n}` tarayıcıya hiç ulaşmaz.
          columns === 3
            ? "lg:grid-cols-3"
            : columns === 5
              ? "lg:grid-cols-5"
              : "lg:grid-cols-4"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  caption,
  tone = "default",
  info,
}: {
  label: string;
  value: ReactNode;
  /** Sayının altındaki tek satırlık dayanak — nereden geldiğini söyler. */
  caption?: ReactNode;
  /** Rakamın rengi. `negative` metin-güvenli koyu kırmızıyı kullanır. */
  tone?: "default" | "negative";
  /** Hesaplama açıklaması; etiketin yanına iliştirilir. */
  info?: ReactNode;
}) {
  return (
    // Bölme çizgisi hairline: bunlar kartın İÇİNDEKİ ayrımlar, dış çerçeve
    // zaten --border taşıyor. İkisi aynı kalınlıkta olunca şerit dört ayrı
    // kutu gibi parçalanıyordu.
    <div className="border-hairline border-t border-l px-4 py-3.5">
      <p className="eyebrow flex items-center gap-1.5">
        {label}
        {info}
      </p>
      <p
        className={cn(
          "t-figure mt-1.5 text-[26px] sm:text-[28px]",
          tone === "negative" && "text-destructive"
        )}
      >
        {value}
      </p>
      {caption && <p className="t-meta mt-2">{caption}</p>}
    </div>
  );
}

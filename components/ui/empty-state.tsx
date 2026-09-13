import type { ReactNode } from "react";

/**
 * Verisi olmayan bölümlerin yüzü.
 *
 * Boş bölümler tek satır gri yazıyla geçiştiriliyordu ("Henüz kayıt yok.")
 * — durumu bildiriyor ama ne yapılacağını söylemiyordu. Boş ekran, bir
 * kusur değil davet: burada ne olacağını ve nasıl başlanacağını söyleyen
 * tek yer.
 *
 * Gömülü yüzeyde duruyor: boşluk, dolu içerikle aynı seviyede parlamasın.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  /** Ne olacağını söyleyen tek cümle. */
  title: string;
  /** Nasıl başlanacağı. */
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bg-sunken border-hairline flex flex-col items-center gap-2 border px-6 py-10 text-center">
      <p className="text-[14px] font-bold">{title}</p>
      {description && (
        <p className="t-meta max-w-[46ch]">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

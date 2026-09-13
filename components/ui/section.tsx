import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CalcInfo } from "@/components/ui/calc-info";

/**
 * Sayfadaki her kartın kabı.
 *
 * Kartlar elle kuruluyordu ve her sayfa aynı deseni biraz farklı yazıyordu:
 * başlık puntosu 18 ya da 17, boşluk py-3 ya da p-4, açıklama bazen iki
 * satır bazen altı. Asıl sorun ise açıklamalardı — her bölümün altında
 * dört-beş satırlık paragraf duruyor ve VERİYLE aynı optik seviyede
 * yarışıyordu. Kullanıcı ikinci ziyaretinde onu okumuyor ama yer kaplamaya
 * devam ediyor.
 *
 * Bölünme şu: `summary` her zaman görünen TEK satır, `help` ise ⓘ ile
 * açılan uzun anlatım. Uzun metin silinmiyor — sistemin niye öyle
 * hesapladığını anlatan o metinler bu uygulamanın değerli parçası —
 * yalnızca isteyene gösteriliyor.
 */
export function Section({
  title,
  summary,
  help,
  helpTitle,
  actions,
  children,
  /** İçeriğin kendi dolgusu varsa (tablo gibi) kapatılır. */
  padded = true,
  className,
  id,
}: {
  title: string;
  /** Her zaman görünen tek satırlık özet. */
  summary?: ReactNode;
  /** ⓘ arkasında duran uzun anlatım. */
  help?: ReactNode;
  /** Balonun başlığı; verilmezse bölüm başlığı kullanılır. */
  helpTitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("border-border border", className)}>
      <header className="border-border flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b-2 px-4 py-3">
        <div className="min-w-0">
          <h2 className="t-section">
            {title}
            {help && (
              <span className="ml-1.5 align-middle">
                <CalcInfo title={helpTitle ?? title}>{help}</CalcInfo>
              </span>
            )}
          </h2>
          {summary && <p className="t-meta mt-1">{summary}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </header>
      <div className={cn(padded && "p-4")}>{children}</div>
    </section>
  );
}

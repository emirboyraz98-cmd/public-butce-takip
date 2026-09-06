"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Table } from "./table";

/** Kayıt listelerinde varsayılan olarak görünen satır sayısı. */
export const DEFAULT_VISIBLE_ROWS = 5;

/**
 * Kaydırıldığında başlık satırı yerinde kalsın. Sticky, `tr` yerine `th`
 * hücrelerine verilir; `thead` üzerindeki sticky bazı tarayıcılarda
 * çalışmıyor. Kenarlık da hücreye taşınır, yoksa kaydırınca kayboluyor.
 */
const STICKY_HEAD =
  "[&_thead_th]:bg-card [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:border-b";

/**
 * Kayıt biriktikçe sayfayı uzatmayan tablo: yalnızca ilk `visibleRows` satır
 * kadar yer kaplar, gerisi kendi içinde kaydırılır. "Genişlet" düğmesiyle
 * tamamı açılır, "Daralt" ile geri toplanır.
 *
 * Yükseklik sabit bir piksel değeriyle değil gerçek satırlar ölçülerek
 * bulunur; satır yükseklikleri tablodan tabloya değişiyor (örn. kredi kartı
 * satırlarında taksit alt satırı var) ve sabit bir değer o tablolarda son
 * satırı ortadan kesiyordu.
 */
export function ScrollableTable({
  rowCount,
  visibleRows = DEFAULT_VISIBLE_ROWS,
  newestFirst = true,
  className,
  children,
}: {
  /** Toplam satır sayısı — alt bilgi metni ve yeniden ölçüm için. */
  rowCount: number;
  visibleRows?: number;
  /** Liste yeniden eskiye sıralıysa alt bilgi "en yeni" der. */
  newestFirst?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();
  const [expanded, setExpanded] = useState(false);

  // Ölçüm ResizeObserver ile tekrarlanır: kapalı sekmeler de DOM'da durduğu
  // için gizliyken bütün ölçüler 0 döner, tablo ancak görünür olunca gerçek
  // boyutuna kavuşur.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const measure = () => {
      const head = table.querySelector("thead");
      const rows = table.querySelectorAll("tbody > tr");
      if (!head || rows.length <= visibleRows) {
        setMaxHeight(undefined);
        return;
      }

      let height = head.getBoundingClientRect().height;
      for (let i = 0; i < visibleRows; i++) {
        height += rows[i].getBoundingClientRect().height;
      }

      const next = Math.round(height);
      if (next <= 0) return; // gizli; görünür olunca yeniden ölçülür
      // Kayan çubuğun yol açtığı 1px'lik oynamalar döngü kurmasın.
      setMaxHeight((prev) =>
        prev !== undefined && Math.abs(prev - next) <= 2 ? prev : next
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [visibleRows, rowCount]);

  // Liste zaten sığıyorsa ne kırpılır ne de düğme gösterilir.
  const overflows = maxHeight !== undefined;
  const clipped = overflows && !expanded;

  return (
    <div>
      <Table
        ref={tableRef}
        className={cn(clipped && STICKY_HEAD, className)}
        containerClassName={clipped ? "overflow-y-auto" : undefined}
        containerStyle={clipped ? { maxHeight } : undefined}
      >
        {children}
      </Table>

      {overflows && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? (
              <ChevronsDownUpIcon className="size-3.5" />
            ) : (
              <ChevronsUpDownIcon className="size-3.5" />
            )}
            {expanded ? "Daralt" : "Genişlet"}
          </Button>
          <span className="text-muted-foreground text-xs">
            {expanded
              ? `${rowCount} kaydın tamamı görünüyor.`
              : `${rowCount} kayıttan ${newestFirst ? "en yeni " : ""}${visibleRows} tanesi görünüyor — kalanı için listeyi kaydır.`}
          </span>
        </div>
      )}
    </div>
  );
}

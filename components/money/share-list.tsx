"use client";

import { useState } from "react";

import { formatMoneyWhole } from "@/lib/format";

export type ShareRow = { name: string; amount: number };

/** Kayıt listelerinde varsayılan olarak görünen satır sayısı. */
const DEFAULT_VISIBLE = 5;

/**
 * Kategori payları: ad, tutar, yüzde ve dolgu çubuğu.
 *
 * İlk beş satır gösteriliyor, gerisi düğmeyle açılıyor — kategori sayısı
 * yirmiyi geçtiğinde liste sayfanın asıl içeriğini aşağı itiyordu.
 *
 * Bilerek "render prop" almıyor, düz veri alıyor: sunucu bileşeninden
 * istemci bileşenine fonksiyon geçirilemiyor (React bunu çalışma anında
 * hata olarak veriyor) ve bu, Raporlar sayfasını 500'e düşürmüştü.
 */
export function ShareList({
  rows,
  currency,
  visible = DEFAULT_VISIBLE,
}: {
  rows: ShareRow[];
  currency: string;
  visible?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  // Yüzdeler TÜM satırların toplamına göre; liste kısaltılsa da paylar
  // değişmemeli, yoksa "ilk beşi göster" oranları şişirirdi.
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const shown = expanded ? rows : rows.slice(0, visible);
  const hidden = rows.length - shown.length;

  return (
    <>
      <ul className="divide-hairline">
        {shown.map((row) => {
          const share = total > 0 ? (row.amount / total) * 100 : 0;
          return (
            <li key={row.name} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{row.name}</span>
                <span className="text-muted-foreground flex-none">
                  {formatMoneyWhole(row.amount, currency)} · %
                  {Math.round(share)}
                </span>
              </div>
              <div className="bg-muted mt-1.5 h-[6px] w-full">
                <div
                  className="bg-foreground h-full"
                  style={{ width: `${share}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="hover:bg-muted border-border text-muted-foreground w-full border-t px-4 py-2.5 text-left text-[13px]"
        >
          {expanded
            ? `İlk ${visible} kategoriyi göster`
            : `Kalan ${hidden} kategoriyi göster`}
        </button>
      )}
    </>
  );
}

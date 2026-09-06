"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import { setCategoryBudget } from "./actions";

export type BudgetRow = {
  categoryId: string;
  name: string;
  /** null = sınır konmamış. */
  limit: string | null;
  spent: string;
  /** 0-100 arası, kırpılmış. */
  percent: number;
  overage: string;
  remaining: string;
};

/**
 * Sınırı aşan kategorilerde çubuk iki tonlu: sınıra kadar olan kısım
 * mürekkep rengi, aşan kısım koyu kırmızı. Aşımı yalnızca alttaki notla
 * anlatmak yetmiyordu — bir listede hangi kategorinin taştığı ancak satır
 * satır okunarak bulunuyordu.
 *
 * Aşımda çubuğun TAMAMI harcamayı temsil eder ve segmentler harcamanın
 * içindeki payları gösterir: 2.000 sınıra 2.600 harcandıysa çubuğun
 * %77'si mürekkep, %23'ü kırmızı. Böylece "ne kadarı bütçe dışıydı"
 * doğrudan okunuyor. On kat aşan bir kategoride çubuk neredeyse tamamen
 * kırmızı çıkar; bu bir kusur değil, durumun kendisi.
 */
function Bar({ spent, limit }: { spent: number; limit: number }) {
  const over = Math.max(spent - limit, 0);

  if (over === 0) {
    // Aşım yok: çubuk sınırı temsil ediyor, dolu kısım harcama.
    const filled = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
    return (
      <div className="bg-muted mt-1.5 h-[8px] w-full">
        <div className="bg-foreground h-full" style={{ width: `${filled}%` }} />
      </div>
    );
  }

  // Aşım var: çubuk harcamayı temsil ediyor, iki segment onu bölüyor.
  const basePart = spent > 0 ? (limit / spent) * 100 : 0;

  return (
    <div className="bg-muted mt-1.5 flex h-[8px] w-full">
      <div className="bg-foreground h-full" style={{ width: `${basePart}%` }} />
      <div
        className="h-full flex-1"
        style={{ background: "var(--overage)" }}
      />
    </div>
  );
}

function LimitCell({
  row,
  currency,
}: {
  row: BudgetRow;
  currency: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.limit ?? "");
  const [isPending, startTransition] = useTransition();

  function save(next: number | null) {
    startTransition(async () => {
      const result = await setCategoryBudget(row.categoryId, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="hover:bg-muted -mx-1 px-1 text-[13px]"
      >
        {row.limit === null ? (
          <span className="text-muted-foreground underline decoration-dotted underline-offset-4">
            Bütçe koy
          </span>
        ) : (
          <span className="font-semibold">
            {formatMoney(row.limit, currency)}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        inputMode="decimal"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save(parseDecimalInput(value));
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-9 w-28"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => save(parseDecimalInput(value))}
      >
        Kaydet
      </Button>
      {row.limit !== null && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => save(null)}
        >
          Kaldır
        </Button>
      )}
    </div>
  );
}

export function BudgetRows({
  rows,
  currency,
}: {
  rows: BudgetRow[];
  currency: string;
}) {
  const [showAll, setShowAll] = useState(false);

  // Bütçesi olanlar üstte: sayfanın konusu onlar. Sınırı olmayan ama o ay
  // harcama görmüş kategoriler hemen altta — "buna bütçe koymalı mıyım"
  // sorusunun doğal yeri orası.
  const withLimit = rows.filter((r) => r.limit !== null);
  const spentOnly = rows.filter(
    (r) => r.limit === null && Number(r.spent) > 0
  );
  // Ne sınırı ne harcaması olanlar katlanıyor: yirmi kategorinin on beşi
  // "harcama yok / bütçe koy" diye tekrarlayınca sayfanın asıl içeriği
  // ekranın dışına düşüyordu.
  const untouched = rows.filter(
    (r) => r.limit === null && Number(r.spent) === 0
  );

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-[13px]">
        Önce Kategoriler sayfasından bir gider kategorisi ekle.
      </p>
    );
  }

  return (
    <div className="divide-hairline">
      {[...withLimit, ...spentOnly, ...untouched.slice(0, showAll ? undefined : 0)].map((row) => {
        const overage = Number(row.overage);

        return (
          <div key={row.categoryId} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[14px] font-semibold">{row.name}</span>
              <LimitCell row={row} currency={currency} />
            </div>

            {row.limit === null ? (
              <p className="text-muted-foreground mt-1 text-[12px]">
                {Number(row.spent) > 0
                  ? `Bu ay ${formatMoney(row.spent, currency)} harcandı — bütçe konmadı, toplamlara girmiyor.`
                  : "Bu ay harcama yok."}
              </p>
            ) : (
              <>
                <p className="text-muted-foreground mt-1 text-[12px]">
                  {formatMoney(row.spent, currency)} /{" "}
                  {formatMoney(row.limit, currency)} · %{Math.round(row.percent)}
                  {overage === 0 && (
                    <span className="ml-1.5">
                      · {formatMoney(row.remaining, currency)} kaldı
                    </span>
                  )}
                </p>
                <Bar spent={Number(row.spent)} limit={Number(row.limit)} />
                {overage > 0 && (
                  <p
                    className="mt-1 text-[12px] font-semibold"
                    style={{ color: "var(--overage)" }}
                  >
                    {formatMoney(row.overage, currency)} aşım
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      {untouched.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="hover:bg-muted text-muted-foreground w-full px-4 py-2.5 text-left text-[13px]"
        >
          {showAll
            ? `Harcaması ve bütçesi olmayan ${untouched.length} kategoriyi gizle`
            : `Harcaması ve bütçesi olmayan ${untouched.length} kategoriyi göster`}
        </button>
      )}
    </div>
  );
}

"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney, formatMonth } from "@/lib/format";
import { toggleLoanPaidMonth } from "./loan-actions";

export type ScheduleRow = {
  /** yyyy-MM */
  month: string;
  amount: string;
  paid: boolean;
  /** Bu ay bugünden önce mi. */
  past: boolean;
};

/**
 * Kredinin taksit takvimi. "Kalan borç" rakamının nereden geldiği ancak
 * toplamı oluşturan ayları görünce anlaşılıyor; liste tam olarak bunu
 * gösterir.
 *
 * Tik kutuları OPSİYONELDİR: hiçbir hesabı değiştirmez, kalan borç yine
 * takvime göre bulunur. İsteyen ödedikçe işaretler ve kendi takibini yapar.
 */
export function LoanSchedule({
  loanId,
  currency,
  rows,
  currentMonth,
}: {
  loanId: string;
  currency: string;
  rows: ScheduleRow[];
  currentMonth: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /**
   * Kutucuk sunucu yanıtını beklemeden işaretlenir. Aksi halde tıklamadan
   * sonra veri yenilenene kadar kutu boş kalıyor ve tıklama işlememiş gibi
   * görünüyordu. Sunucu hata dönerse iyimser durum kendiliğinden geri alınır.
   */
  const [paidMonths, togglePaid] = useOptimistic(
    new Set(rows.filter((r) => r.paid).map((r) => r.month)),
    (current: Set<string>, action: { month: string; paid: boolean }) => {
      const next = new Set(current);
      if (action.paid) next.add(action.month);
      else next.delete(action.month);
      return next;
    }
  );

  if (rows.length === 0) return null;

  const checkedCount = rows.filter((r) => paidMonths.has(r.month)).length;
  const uncheckedTotal = rows
    .filter((r) => !paidMonths.has(r.month))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="mt-4 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-medium"
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
        Ödeme takvimi ({rows.length} taksit)
        {checkedCount > 0 && (
          <span className="text-xs">· {checkedCount} işaretli</span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground text-xs">
            &quot;Kalan borç&quot;, bu ay ({formatMonth(currentMonth)}) dahil olmak üzere
            bitiş ayına kadar kalan taksitlerin toplamıdır — aşağıda{" "}
            <strong className="text-foreground">Kalan</strong> etiketli
            satırlar. Yandaki kutucuklar tamamen isteğe bağlıdır; işaretlemek
            hesabı değiştirmez, yalnızca kendi takibin içindir.
          </p>

          <ul className="divide-border divide-y border">
            {rows.map((row) => (
              <li
                key={row.month}
                className={`flex items-center gap-3 border-l-2 px-3 py-2 text-sm ${
                  row.past
                    ? "border-transparent"
                    : "border-primary bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={paidMonths.has(row.month)}
                  aria-label={`${row.month} taksiti ödendi`}
                  onChange={(e) => {
                    const next = e.target.checked;
                    startTransition(async () => {
                      togglePaid({ month: row.month, paid: next });
                      const result = await toggleLoanPaidMonth(
                        loanId,
                        row.month,
                        next
                      );
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                  className="size-4"
                />
                <span
                  className={
                    row.past ? "text-muted-foreground" : "text-foreground"
                  }
                >
                  {formatMonth(row.month)}
                </span>
                {!row.past && (
                  <span className="text-muted-foreground border px-1.5 py-0.5 text-[10px] leading-none">
                    Kalan
                  </span>
                )}
                <span
                  className={`ml-auto font-medium ${
                    paidMonths.has(row.month)
                      ? "text-muted-foreground line-through"
                      : ""
                  }`}
                >
                  {formatMoney(row.amount, currency)}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-sm">
            <span className="text-muted-foreground">
              Kalan borç ({rows.filter((r) => !r.past).length} taksit):{" "}
            </span>
            <span className="font-medium">
              {formatMoney(
                rows
                  .filter((r) => !r.past)
                  .reduce((sum, r) => sum + Number(r.amount), 0),
                currency
              )}
            </span>
          </p>

          {checkedCount > 0 && (
            <p className="text-sm">
              <span className="text-muted-foreground">
                İşaretlenmemiş taksitler:{" "}
              </span>
              <span className="font-medium">
                {formatMoney(uncheckedTotal, currency)}
              </span>
            </p>
          )}

          {checkedCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const marked = rows.filter((r) => paidMonths.has(r.month));
                  for (const row of marked) {
                    togglePaid({ month: row.month, paid: false });
                  }
                  for (const row of marked) {
                    await toggleLoanPaidMonth(loanId, row.month, false);
                  }
                  router.refresh();
                })
              }
            >
              Tüm işaretleri kaldır
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

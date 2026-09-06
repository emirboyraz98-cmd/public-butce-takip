"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import { formatMoney, formatMonth } from "@/lib/format";
import { CalcInfo } from "@/components/ui/calc-info";
import { LoanSchedule, type ScheduleRow } from "./loan-schedule";
import {
  createLoanPeriod,
  deleteLoan,
  deleteLoanPeriod,
  updateLoan,
  updateLoanPeriod,
} from "./loan-actions";

export type LoanPeriodRow = {
  id: string;
  amount: string;
  /** yyyy-MM */
  effectiveFrom: string;
  /** Bu dönemin geçerli olduğu son ay; bir sonraki dönemden türetilir. */
  effectiveTo: string | null;
};

export type LoanRow = {
  id: string;
  name: string;
  currency: string;
  startMonth: string;
  endMonth: string | null;
  periods: LoanPeriodRow[];
  /** İçinde bulunulan aydaki taksit; kredi aktif değilse null. */
  currentInstallment: string | null;
  remainingInstallments: number | null;
  remainingTotal: string | null;
  paidTotal: string;
  /** Kredinin baştan sona toplam maliyeti; süresizse null. */
  totalPayable: string | null;
  totalInstallments: number | null;
  schedule: ScheduleRow[];
};

/**
 * Kredi kartındaki tek bir sayı. Sıra bilerek şöyle: önce ne kadar borcun
 * kaldığı (asıl merak edilen), sonra bu ayın taksiti, sonra bugüne kadar
 * ödenen ve en sonda kredinin toplam maliyeti.
 */
function Metric({
  label,
  value,
  hint,
  emphasis,
}: {
  label: React.ReactNode;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={emphasis ? "text-lg font-semibold" : "font-medium"}>
        {value}
      </dd>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function LoanTable({
  loans,
  currentMonth,
}: {
  loans: LoanRow[];
  currentMonth: string;
}) {
  if (loans.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Henüz kredi eklenmedi. Yukarıdaki formla ilk kredini ekleyebilirsin.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {loans.map((loan) => (
        <LoanCard key={loan.id} loan={loan} currentMonth={currentMonth} />
      ))}
    </div>
  );
}

function LoanCard({
  loan,
  currentMonth,
}: {
  loan: LoanRow;
  currentMonth: string;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [addingPeriod, setAddingPeriod] = useState(false);

  return (
    <div className=" border">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-4">
        {isEditing ? (
          <LoanEditForm
            loan={loan}
            onDone={() => {
              setIsEditing(false);
              router.refresh();
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium">{loan.name}</p>
              <p className="text-muted-foreground text-sm">
                {formatMonth(loan.startMonth)} –{" "}
                {loan.endMonth ? formatMonth(loan.endMonth) : "süresiz"}
              </p>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label={
                    <>
                      Kalan borç{" "}
                      <CalcInfo title="Kalan borç">
                        <p>
                          İçinde bulunulan ay ({formatMonth(currentMonth)}) <strong>dahil</strong>,
                          kredinin bitiş ayına kadar ödenecek taksitlerin
                          toplamı. Bu ayın taksiti henüz ödenmiş sayılmaz,
                          toplamdan düşülmez.
                        </p>
                        <p>
                          Taksit tutarı dönemlere göre değişiyorsa her ay kendi
                          döneminin tutarıyla sayılır. Aşağıdaki &quot;Ödeme
                          takvimi&quot; listesi bu toplamı oluşturan ayları tek
                          tek gösterir.
                        </p>
                        <p>
                          Kredinin bitiş ayı girilmemişse takvim sonsuz
                          olacağından hesaplanamaz.
                        </p>
                      </CalcInfo>
                    </>
                  }
                  value={
                    loan.remainingTotal
                      ? formatMoney(loan.remainingTotal, loan.currency)
                      : "hesaplanamaz"
                  }
                  hint={
                    loan.remainingInstallments !== null
                      ? `${loan.remainingInstallments} taksit`
                      : undefined
                  }
                  emphasis
                />
                <Metric
                  label="Bu ay"
                  value={
                    loan.currentInstallment
                      ? formatMoney(loan.currentInstallment, loan.currency)
                      : "—"
                  }
                  hint={formatMonth(currentMonth)}
                />
                <Metric
                  label="Ödenen"
                  value={formatMoney(loan.paidTotal, loan.currency)}
                  hint={`${formatMonth(currentMonth)} öncesi`}
                />
                <Metric
                  label="Toplam ödeme"
                  value={
                    loan.totalPayable
                      ? formatMoney(loan.totalPayable, loan.currency)
                      : "hesaplanamaz"
                  }
                  hint={
                    loan.totalInstallments !== null
                      ? `${loan.totalInstallments} taksitin tamamı`
                      : undefined
                  }
                />
              </dl>
            </div>
            <div className="space-x-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setIsEditing(true)}
              >
                Düzenle
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteLoan(loan.id);
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Kredi silindi.");
                    router.refresh();
                  })
                }
              >
                Sil
              </Button>
            </div>
          </>
        )}
      </div>

      {!loan.endMonth && (
        <p className="text-muted-foreground flex items-start gap-2 border-b px-4 py-2 text-xs">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            Bu kredinin son taksit ayı girilmemiş. Genel Bakış&apos;ta ileri
            aylara baktığında taksit sonsuza kadar gider olarak yazılır —
            &quot;Düzenle&quot; ile bitiş ayını eklemen önerilir.
          </span>
        </p>
      )}

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Ödeme Dönemleri</p>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setAddingPeriod((v) => !v)}
          >
            {addingPeriod ? "Vazgeç" : "Ödeme dönemi ekle"}
          </Button>
        </div>

        {addingPeriod && (
          <AddPeriodForm
            loan={loan}
            onDone={() => {
              setAddingPeriod(false);
              router.refresh();
            }}
          />
        )}

        <PeriodTable loan={loan} />

        <LoanSchedule
          loanId={loan.id}
          currency={loan.currency}
          rows={loan.schedule}
          currentMonth={currentMonth}
        />
      </div>
    </div>
  );
}

function LoanEditForm({
  loan,
  onDone,
  onCancel,
}: {
  loan: LoanRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(loan.name);
  const [currency, setCurrency] = useState(loan.currency);
  const [startMonth, setStartMonth] = useState(loan.startMonth);
  const [endMonth, setEndMonth] = useState(loan.endMonth ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", loan.id);
      formData.set("name", name);
      formData.set("currency", currency);
      formData.set("startMonth", startMonth);
      if (endMonth) formData.set("endMonth", endMonth);

      const result = await updateLoan({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Kredi güncellendi.");
      onDone();
    });
  }

  return (
    <div className="flex w-full flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <label className="text-xs font-medium">Ad</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-44"
        />
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium">Para Birimi</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="border-input bg-muted h-8 border px-2 text-sm"
          aria-label="Para birimi"
        >
          <option value="TRY">TRY</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium">İlk Taksit</label>
        <Input
          type="month"
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
          className="h-8 w-36"
        />
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium">Son Taksit</label>
        <Input
          type="month"
          value={endMonth}
          min={startMonth || undefined}
          onChange={(e) => setEndMonth(e.target.value)}
          className="h-8 w-36"
        />
      </div>
      <Button size="sm" className="h-8" disabled={isPending} onClick={save}>
        Kaydet
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
        Vazgeç
      </Button>
    </div>
  );
}

function AddPeriodForm({ loan, onDone }: { loan: LoanRow; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    const parsed = parseDecimalInput(amount);
    if (parsed === null || parsed <= 0) {
      toast.error("Taksit 0'dan büyük geçerli bir sayı olmalı.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("loanId", loan.id);
      formData.set("amount", String(parsed));
      formData.set("effectiveFrom", effectiveFrom);

      const result = await createLoanPeriod({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Ödeme dönemi eklendi.");
      setAmount("");
      setEffectiveFrom("");
      onDone();
    });
  }

  return (
    <div className="bg-muted/40 mb-3 flex flex-wrap items-end gap-3 border p-3">
      <div className="grid gap-1.5">
        <label className="text-xs font-medium">Yeni tutar geçerli olduğu ay</label>
        <Input
          type="month"
          value={effectiveFrom}
          min={loan.startMonth}
          max={loan.endMonth ?? undefined}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="h-8 w-36"
        />
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium">Aylık Taksit</label>
        <Input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-32"
          placeholder="18000"
        />
      </div>
      <Button size="sm" className="h-8" disabled={isPending} onClick={save}>
        Ekle
      </Button>
      <p className="text-muted-foreground w-full text-xs">
        Bu tutar, girdiğin aydan itibaren bir sonraki dönem başlayana (yoksa
        kredi bitene) kadar geçerli olur.
      </p>
    </div>
  );
}

function PeriodTable({ loan }: { loan: LoanRow }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dönem</TableHead>
            <TableHead>Aylık Taksit</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loan.periods.map((period) =>
            editingId === period.id ? (
              <EditablePeriodRow
                key={period.id}
                loan={loan}
                period={period}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <TableRow key={period.id}>
                <TableCell>
                  {formatMonth(period.effectiveFrom)} –{" "}
                  {period.effectiveTo ? formatMonth(period.effectiveTo) : "süresiz"}
                </TableCell>
                <TableCell className="font-medium">
                  {formatMoney(period.amount, loan.currency)}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setEditingId(period.id)}
                  >
                    Düzenle
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteLoanPeriod(period.id);
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Dönem silindi.");
                        router.refresh();
                      })
                    }
                  >
                    Sil
                  </Button>
                </TableCell>
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EditablePeriodRow({
  loan,
  period,
  onDone,
  onCancel,
}: {
  loan: LoanRow;
  period: LoanPeriodRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(period.amount);
  const [effectiveFrom, setEffectiveFrom] = useState(period.effectiveFrom);
  // Bitiş saklanmaz, komşudan türer; düzenlenirse sonraki dönemin
  // başlangıcını (son dönemse kredinin bitişini) günceller.
  const [effectiveTo, setEffectiveTo] = useState(period.effectiveTo ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    const parsed = parseDecimalInput(amount);
    if (parsed === null || parsed <= 0) {
      toast.error("Taksit 0'dan büyük geçerli bir sayı olmalı.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", period.id);
      formData.set("loanId", loan.id);
      formData.set("amount", String(parsed));
      formData.set("effectiveFrom", effectiveFrom);
      if (effectiveTo) formData.set("effectiveTo", effectiveTo);

      const result = await updateLoanPeriod({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Dönem güncellendi.");
      onDone();
    });
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <Input
            type="month"
            value={effectiveFrom}
            min={loan.startMonth}
            max={loan.endMonth ?? undefined}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="h-8 w-36"
            aria-label="Dönem başlangıcı"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="month"
            value={effectiveTo}
            min={effectiveFrom}
            onChange={(e) => setEffectiveTo(e.target.value)}
            className="h-8 w-36"
            aria-label="Dönem bitişi"
          />
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-32"
          aria-label="Aylık taksit"
        />
      </TableCell>
      <TableCell className="space-x-1 text-right">
        <Button size="sm" className="h-8" disabled={isPending} onClick={save}>
          Kaydet
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
          Vazgeç
        </Button>
      </TableCell>
    </TableRow>
  );
}

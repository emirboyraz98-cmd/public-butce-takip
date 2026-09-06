"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney, formatMonth } from "@/lib/format";
import {
  paymentMonthOptions,
  splitInstallments,
  suggestPaymentMonth,
} from "@/lib/expenses/creditCard";

/**
 * Kayıt türü. Üçü de aynı alanları paylaşıyor; kredi kartı iki alan
 * ekliyor (ekstre ayı, taksit), gelir ise hiçbirini eklemiyor.
 */
export type RecordKind = "income" | "cash" | "card";

export type CategoryOption = { id: string; name: string };

export type RecordValues = {
  id?: string;
  categoryId: string;
  amount: string;
  currency: "TRY" | "USD";
  date: string;
  frequency: "ONE_TIME" | "MONTHLY";
  note: string;
  paymentMonth: string;
  installmentCount: number;
};

type ActionResult = { error?: string; success?: boolean };

const EMPTY: RecordValues = {
  categoryId: "",
  amount: "",
  currency: "TRY",
  date: "",
  frequency: "ONE_TIME",
  note: "",
  paymentMonth: "",
  installmentCount: 1,
};

/** Teslimattaki hızlı seçim; "Diğer" tam listeyi açıyor. */
const QUICK_INSTALLMENTS = [1, 3, 6, 9, 12];
const ALL_INSTALLMENTS = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36];

const TITLES: Record<RecordKind, { add: string; edit: string }> = {
  income: { add: "Gelir ekle", edit: "Geliri düzenle" },
  cash: { add: "Gider ekle", edit: "Gideri düzenle" },
  card: { add: "Kart harcaması ekle", edit: "Kart harcamasını düzenle" },
};

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="eyebrow">{label}</span>
      {children}
      {hint && (
        <p className="text-muted-foreground text-[12px] leading-snug">{hint}</p>
      )}
    </div>
  );
}

/** Yerel <select>; görünüm Input ile aynı hizada kalsın diye tek yerde. */
function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-muted text-foreground min-h-11 w-full border px-2 text-[14px] sm:min-h-9",
        "focus-visible:border-ring focus-visible:border-2 focus-visible:outline-none",
        "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

/**
 * Gelir, nakit gider ve kart harcaması için TEK kayıt penceresi.
 *
 * Önce üç ayrı form vardı (income-form, expense-form, credit-card-form) ve
 * üçü de aynı altı alanı kendi kopyasında tutuyordu; bir alana yapılan
 * düzeltme diğer ikisine taşınmayı unutuyordu. Fark yalnızca iki alan:
 * kart kaydında ekstre ayı ve taksit var.
 *
 * Formlar sayfanın içinde, tablonun üstünde duruyordu ve her zaman yer
 * kaplıyordu — kullanıcı listeye bakmak istediğinde bile. Pencereye
 * taşınınca liste sayfanın tamamını alıyor.
 *
 * Alanların başlangıç değerleri yalnızca ilk kuruluşta okunuyor. Çağıran
 * taraf düzenlenen kaydın kimliğini `key` olarak vermeli, yoksa ikinci kez
 * açılan pencere bir öncekinin değerlerini gösterir.
 */
export function RecordDialog({
  open,
  onOpenChange,
  kind,
  categories,
  initial,
  onSubmit,
  statementOffset = 1,
  onKindChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: RecordKind;
  categories: CategoryOption[];
  /** Doluysa düzenleme kipi. */
  initial?: Partial<RecordValues>;
  onSubmit: (values: RecordValues) => Promise<ActionResult>;
  /** Kullanıcının ekstre gecikmesi ayarı (ay). */
  statementOffset?: number;
  /** Verilirse başlıkta ödeme türü segmenti çıkar (nakit <-> kart). */
  onKindChange?: (kind: RecordKind) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<RecordValues>({ ...EMPTY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Kullanıcı ekstre ayına elle dokunduysa tarih değiştikçe onu ezmeyiz.
  const [manualMonth, setManualMonth] = useState(false);
  const [allInstallments, setAllInstallments] = useState(false);

  const isEdit = Boolean(initial?.id);
  const isCard = kind === "card";

  function change(patch: Partial<RecordValues>) {
    setValues((v) => ({ ...v, ...patch }));
  }

  function changeDate(date: string) {
    setValues((v) => {
      if (!date || !isCard) return { ...v, date };
      // Elle seçilen ay yeni tarihe göre geçersiz kalırsa (ödeme harcamadan
      // önce olamaz) öneriye geri dönülür.
      const stale = !v.paymentMonth || v.paymentMonth < date.slice(0, 7);
      if (manualMonth && !stale) return { ...v, date };
      return {
        ...v,
        date,
        paymentMonth: suggestPaymentMonth(date, statementOffset),
      };
    });
  }

  const amountNumber = Number(values.amount.replace(",", "."));
  const monthOptions = values.date ? paymentMonthOptions(values.date) : [];
  const perInstallment =
    values.installmentCount > 1 && amountNumber > 0
      ? splitInstallments(amountNumber, values.installmentCount)[0].toString()
      : null;

  const installmentOptions = allInstallments
    ? ALL_INSTALLMENTS
    : // Kayıtta listede olmayan bir taksit varsa (36 gibi) tam listeye
      // geçilir; yoksa düzenlerken kendi değeri seçeneklerde bulunmazdı.
      QUICK_INSTALLMENTS.includes(values.installmentCount)
      ? QUICK_INSTALLMENTS
      : ALL_INSTALLMENTS;

  async function save() {
    setError(null);
    if (!values.categoryId) return setError("Kategori seç");
    if (!values.date) return setError("Tarih gir");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return setError("Tutar 0'dan büyük olmalı");
    }

    setSaving(true);
    const payload: RecordValues = {
      ...values,
      amount: String(amountNumber),
      paymentMonth: isCard
        ? values.paymentMonth || suggestPaymentMonth(values.date, statementOffset)
        : "",
      installmentCount: isCard ? values.installmentCount : 1,
    };
    const result = await onSubmit(payload);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(isEdit ? "Kayıt güncellendi" : "Kayıt eklendi");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLES[kind][isEdit ? "edit" : "add"]}</DialogTitle>
          <DialogDescription className="sr-only">
            Tutar, kategori ve tarih girerek kayıt oluştur.
          </DialogDescription>
        </DialogHeader>

        {/* Ödeme türü yalnızca gider tarafında ve yalnızca YENİ kayıtta
            değiştirilebilir: var olan bir kaydın türünü değiştirmek ekstre
            ayı ve taksit alanlarını anlamsız bırakırdı. */}
        {onKindChange && !isEdit && (
          <Field label="Ödeme türü">
            <div className="border-border flex border">
              {(
                [
                  { value: "card", label: "Kredi kartı" },
                  { value: "cash", label: "Nakit · havale" },
                ] as const
              ).map((option, i) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={kind === option.value}
                  onClick={() => onKindChange(option.value)}
                  className={cn(
                    "min-h-11 flex-1 px-3 text-[13px] font-semibold sm:min-h-9",
                    i > 0 && "border-border border-l",
                    kind === option.value
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isCard ? "Harcama tarihi" : "Tarih"}>
            <Input
              type="date"
              value={values.date}
              onChange={(e) => changeDate(e.target.value)}
            />
          </Field>
          <Field label="Kategori">
            <NativeSelect
              value={values.categoryId}
              onChange={(e) => change({ categoryId: e.target.value })}
            >
              <option value="">Seç</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Field label={values.installmentCount > 1 ? "Toplam tutar" : "Tutar"}>
            <Input
              inputMode="decimal"
              placeholder="0"
              value={values.amount}
              onChange={(e) => change({ amount: e.target.value })}
              className="h-12 text-[22px] font-extrabold sm:h-12"
            />
          </Field>
          <Field label="Para birimi">
            <NativeSelect
              value={values.currency}
              onChange={(e) =>
                change({ currency: e.target.value as "TRY" | "USD" })
              }
              className="h-12 sm:h-12"
            >
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
            </NativeSelect>
          </Field>
        </div>

        {isCard && (
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              label="Ekstre ayı"
              hint="Nakit akışına bu ayda girer."
            >
              <NativeSelect
                value={values.paymentMonth}
                disabled={!values.date}
                onChange={(e) => {
                  setManualMonth(true);
                  change({ paymentMonth: e.target.value });
                }}
              >
                {!values.paymentMonth && (
                  <option value="">Önce tarih seç</option>
                )}
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {formatMonth(month)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              label="Taksit"
              hint={
                perInstallment
                  ? `Aylık ${formatMoney(perInstallment, values.currency)}`
                  : "Tutarın tamamı tek seferde"
              }
            >
              {/* Teslimatta taksit kapalı bir alan olarak duruyor ve
                  açılınca 1/3/6/9/12/Diğer çıkıyor. Çoğu harcama tek
                  çekim; tam listeyi her seferinde göstermek dokuz satırlık
                  bir seçiciyi hep açık tutmak demekti. */}
              <div className="flex flex-wrap gap-1.5">
                {installmentOptions.map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={values.installmentCount === count}
                    onClick={() => change({ installmentCount: count })}
                    className={cn(
                      "border-border min-h-11 min-w-11 border px-2.5 text-[13px] font-semibold sm:min-h-9 sm:min-w-9",
                      values.installmentCount === count
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    {count === 1 ? "Tek çekim" : count}
                  </button>
                ))}
                {!allInstallments &&
                  installmentOptions === QUICK_INSTALLMENTS && (
                    <button
                      type="button"
                      onClick={() => setAllInstallments(true)}
                      className="border-border hover:bg-muted min-h-11 border px-2.5 text-[13px] font-semibold sm:min-h-9"
                    >
                      Diğer
                    </button>
                  )}
              </div>
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tekrar">
            <NativeSelect
              value={values.frequency}
              onChange={(e) =>
                change({
                  frequency: e.target.value as "ONE_TIME" | "MONTHLY",
                })
              }
            >
              <option value="ONE_TIME">Tek seferlik</option>
              <option value="MONTHLY">Aylık tekrarlayan</option>
            </NativeSelect>
          </Field>
          <Field label="Not (opsiyonel)">
            <Input
              value={values.note}
              onChange={(e) => change({ note: e.target.value })}
            />
          </Field>
        </div>

        {error && (
          <p className="text-destructive text-[13px] font-semibold">{error}</p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-muted-foreground text-[12px] leading-snug">
            {isCard && values.paymentMonth
              ? `Ekstre ödemesi ${formatMonth(values.paymentMonth)} ayında nakit akışına yazılır.`
              : values.frequency === "MONTHLY"
                ? "Bu kayıt başladığı aydan itibaren her ay tekrar eder."
                : null}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Vazgeç
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

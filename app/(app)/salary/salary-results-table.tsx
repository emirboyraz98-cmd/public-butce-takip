"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { cn } from "@/lib/utils";
import { formatMoney, formatMonth } from "@/lib/format";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import { CalcInfo } from "@/components/ui/calc-info";
import { setActualPayment } from "./actions";

export type SalaryResultRow = {
  id: string;
  month: string;
  mode: "FIXED" | "VARIABLE";
  currency: "TRY" | "USD";
  total: string;
  actualAmount: string | null;
  avgUsdTryRate: string | null;
  /** Kurun hangi ayın TCMB verisinden geldiği (normalde `month` ile aynı). */
  fxRateMonth: string | null;
  /** Ayı 30 güne getirmek için normal güne eklenen/çıkarılan gün (-1, 0, +1, +2). */
  monthLengthAdjustment: number;
};

/** Kuru her zaman iki ondalıkla yazar: 47,22. */
function formatRate(rate: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
}

/** Ay uzunluğu düzeltmesini anlatan kısa etiket. */
function adjustmentLabel(days: number): string | null {
  if (days === 0) return null;
  return days < 0
    ? `Ay 30 güne indirildi: ${Math.abs(days)} normal çalışma günü düşüldü`
    : `Ay 30 güne tamamlandı: ${days} normal çalışma günü eklendi`;
}

/** Tutarın hangi kurla hesaplandığını üzerine gelince gösteren etiket. */
function fxSourceTitle(row: SalaryResultRow): string | undefined {
  if (!row.avgUsdTryRate) return undefined;

  const base = `Kur kaynağı: TCMB ${row.fxRateMonth ?? row.month} ortalaması (${row.avgUsdTryRate})`;
  return row.fxRateMonth && row.fxRateMonth !== row.month
    ? `${base} — DİKKAT: ${row.month} ayının kuru henüz yayınlanmadığı için geçici olarak bu ayın kuru kullanıldı, kesinleşince değişecek.`
    : base;
}

const CALC_INFO = (
  <CalcInfo title="Hesaplanan tutar nasıl bulunur">
    <p>
      <strong>Değişken:</strong> ayın her günü takvimdeki işaretine göre
      sınıflandırılır; her gün için (saatlik ücret × gün
      tipi katsayısı) toplanıp nominal USD toplamı bulunur. Bu toplam,
      (referans kur / o ayın TCMB ortalama kuru) ile çarpılarak düzeltilir.
    </p>
    <p>
      Bordro ayı her zaman <strong>30 gün / 225 saat</strong> sayar. Ayın
      tamamı işaretlenmişse takvim farkı normal çalışma gününden düzeltilir:
      31 günlük ayda 1 gün düşülür, şubatta 2 gün eklenir. İzin ve resmi tatil
      gün sayılarına dokunulmaz. Ay kısmen işaretlenmişse düzeltme uygulanmaz.
    </p>
    <p>
      <strong>Sabit:</strong> hiçbir formül uygulanmaz; ayı kapsayan Baz Maaş
      döneminde girilen tutar doğrudan kullanılır.
    </p>
  </CalcInfo>
);

/**
 * Hesaplanan tutarın hücresi — kur ve gün düzeltmesi rozetleriyle.
 * İki tabloda da aynı biçimde görünmesi gerekiyor.
 */
function TotalCell({ row }: { row: SalaryResultRow }) {
  return (
    <>
      <span
        title={fxSourceTitle(row)}
        className={
          row.avgUsdTryRate
            ? "decoration-muted-foreground/50 cursor-help underline decoration-dotted underline-offset-4"
            : undefined
        }
      >
        {formatMoney(row.total, row.currency)}
      </span>
      {row.fxRateMonth && row.fxRateMonth !== row.month && (
        <span
          title={fxSourceTitle(row)}
          className="text-muted-foreground ml-1.5 cursor-help text-[11px]"
        >
          (geçici kur)
        </span>
      )}
      {adjustmentLabel(row.monthLengthAdjustment) && (
        <span
          title={adjustmentLabel(row.monthLengthAdjustment)!}
          className="text-muted-foreground ml-1.5 cursor-help text-[11px]"
        >
          ({row.monthLengthAdjustment > 0 ? "+" : ""}
          {row.monthLengthAdjustment} gün)
        </span>
      )}
    </>
  );
}

/**
 * "Gerçekleşen" hücresi doğrudan tıklanıp düzenlenir.
 *
 * Tablonun altında ayrı bir giriş formu vardı; hangi aya yazıldığını ayrıca
 * seçmek gerekiyordu ve yanlış aya girme ihtimali doğuyordu. Hücrenin
 * kendisi düzenlenince satır zaten ayı söylüyor.
 */
function ActualPaymentCell({ row }: { row: SalaryResultRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.actualAmount ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("month", row.month);
      // Virgüllü giriş sunucuda NaN olurdu; normalize edip gönderiyoruz.
      const parsed = parseDecimalInput(value);
      if (parsed !== null) formData.set("actualAmount", String(parsed));
      const result = await setActualPayment({}, formData);
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
        className="hover:bg-muted -mx-1 px-1 text-left"
        onClick={() => setEditing(true)}
      >
        {row.actualAmount ? (
          formatMoney(row.actualAmount, row.currency)
        ) : (
          <span className="text-muted-foreground text-[12px] underline decoration-dotted underline-offset-4">
            Tutar gir
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-9 w-28"
        autoFocus
      />
      <Button size="sm" variant="outline" disabled={isPending} onClick={save}>
        Kaydet
      </Button>
    </div>
  );
}

/**
 * Hesaplanan, bankaya yatan ve ikisinin TL karşılığı — tek tabloda.
 *
 * Önce ayrı bir "Aylık sonuçlar" tablosu daha vardı; ikisi aynı ayları
 * aynı sırayla listeliyor, yalnızca sütunları farklıydı. Aynı satırı iki
 * kez okumak gerekiyordu.
 *
 * FARK sütunu bilerek tek para biriminde kalıyor: sözleşme dolarına karşı
 * banka doları. Araya kur girseydi fark, eksik ödemeden mi kur
 * hareketinden mi geldiği anlaşılmazdı. TL karşılığı ayrı bir sütun olarak
 * duruyor ve GERÇEKLEŞEN varsa onun üzerinden hesaplanıyor — cebe giren
 * gerçek tutar o.
 */
export function SalaryReconciliationTable({
  results,
}: {
  results: SalaryResultRow[];
}) {
  if (results.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-[13px]">
        Henüz hesaplanmış bir ay yok.
      </p>
    );
  }

  return (
    <ScrollableTable rowCount={results.length}>
      <TableHeader>
        <TableRow>
          <TableHead>Ay</TableHead>
          <TableHead className="text-right">
            <span className="inline-flex items-center gap-1.5">
              Hesaplanan
              {CALC_INFO}
            </span>
          </TableHead>
          <TableHead className="text-right">Gerçekleşen</TableHead>
          <TableHead className="text-right">Fark</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Kur</TableHead>
          <TableHead className="text-right">TRY karşılığı</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((r) => {
          const diff =
            r.actualAmount === null
              ? null
              : Number(r.actualAmount) - Number(r.total);

          const rate = r.avgUsdTryRate ? Number(r.avgUsdTryRate) : null;
          // TL karşılığı, gerçekleşen girilmişse onun üzerinden: cebe giren
          // tutar bankanın yatırdığıdır, sözleşmenin öngördüğü değil.
          const basis = Number(r.actualAmount ?? r.total);
          const tryValue =
            r.currency === "TRY" ? basis : rate === null ? null : basis * rate;

          return (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">
                {formatMonth(r.month)}
                {/* Yöntem ayın yanında: maaş türü dönem bazlı olduğundan
                    aynı tabloda gün bazlı ve sabit aylar yan yana durabilir
                    ve hangisinin hangisi olduğu para biriminden tahmin
                    edilemez — sabit bir dönem de USD olabilir. */}
                <span
                  className={cn(
                    "ml-2 inline-block border px-1 py-px align-middle text-[10px] font-bold",
                    r.mode === "VARIABLE"
                      ? "border-border text-muted-foreground"
                      : "border-accent-text text-accent-text"
                  )}
                  title={
                    r.mode === "VARIABLE"
                      ? "Gün bazlı: takvimde işaretlenen günlerden hesaplandı"
                      : "Sabit: dönemin tutarı doğrudan kullanıldı"
                  }
                >
                  {r.mode === "VARIABLE" ? "gün bazlı" : "sabit"}
                </span>
              </TableCell>
              <TableCell className="text-right font-semibold whitespace-nowrap">
                <TotalCell row={r} />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <ActualPaymentCell row={r} />
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-semibold whitespace-nowrap",
                  // Sıfır fark vurgulanmaz: beklenen durum bu.
                  diff !== null && diff < 0 && "text-destructive"
                )}
              >
                {diff === null
                  ? "—"
                  : diff === 0
                    ? "0"
                    : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff), r.currency)}`}
              </TableCell>
              <TableCell
                title={fxSourceTitle(r)}
                className="text-muted-foreground hidden text-right whitespace-nowrap sm:table-cell"
              >
                {/* Kur iki ondalıkla: dördüncü basamak ekranda bilgi
                    taşımıyor, yalnızca sütunu genişletiyor. Hesaplama
                    tam değerle yapılıyor, kırpma sadece gösterimde. */}
                {rate === null ? "—" : formatRate(rate)}
              </TableCell>
              <TableCell className="text-right font-semibold whitespace-nowrap">
                {tryValue === null ? "—" : formatMoney(tryValue, "TRY")}
                {r.actualAmount !== null && r.currency !== "TRY" && (
                  <span className="text-muted-foreground block text-[11px] font-normal">
                    gerçekleşenden
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </ScrollableTable>
  );
}

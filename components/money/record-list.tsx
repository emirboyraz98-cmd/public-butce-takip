"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEFAULT_VISIBLE_ROWS,
  ScrollableTable,
} from "@/components/ui/scrollable-table";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import {
  RecordDialog,
  type CategoryOption,
  type RecordKind,
  type RecordValues,
} from "./record-dialog";
import { ALL_TIME, DateRangeFilter, type DateRange } from "./date-range-filter";

export type RecordRow = {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  categoryId: string;
  categoryName: string;
  /** Kaydın kendi para birimindeki tutarı. */
  amount: string;
  currency: string;
  frequency: "ONE_TIME" | "MONTHLY";
  note: string | null;
  /** Baz para birimine çevrilmiş karşılığı; kur yoksa null. */
  baseAmount: string | null;
  kind: RecordKind;
  paymentMonth?: string | null;
  installmentCount?: number;
};

export type RecordFilter = {
  value: string;
  label: string;
  /** Hangi satırlar kalsın. */
  match: (row: RecordRow) => boolean;
};

type ActionResult = { error?: string; success?: boolean };

/**
 * Kaydın nasıl ödendiğini/geldiğini tek kelimede söyleyen rozet.
 *
 * Tabloda "Tür" sütunu eskiden yoktu; bir satırın kart harcaması mı nakit
 * mi olduğu ancak hangi sekmede durduğuna bakılarak anlaşılıyordu. Liste
 * tek sayfada birleşince rozet zorunlu hale geldi.
 */
function KindBadge({ row }: { row: RecordRow }) {
  const label =
    row.kind === "card"
      ? (row.installmentCount ?? 1) > 1
        ? `Kart · ${row.installmentCount} taksit`
        : "Kart"
      : row.frequency === "MONTHLY"
        ? "Otomatik · aylık"
        : "Havale";

  return (
    <span className="border-border inline-block border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
      {label}
    </span>
  );
}

export function RecordList({
  rows,
  categories,
  filters,
  baseCurrency,
  addLabel,
  defaultKind,
  kindSwitchable = false,
  statementOffset = 1,
  onCreate,
  onUpdate,
  onDelete,
  csvHref,
  emptyMessage,
  extraActions,
}: {
  rows: RecordRow[];
  categories: CategoryOption[];
  /** Üstteki çip sırası; ilki her zaman "Tümü" olmalı. */
  filters: RecordFilter[];
  baseCurrency: string;
  addLabel: string;
  defaultKind: RecordKind;
  /** Gider tarafında kart <-> nakit geçişi penceresinde açılsın mı. */
  kindSwitchable?: boolean;
  statementOffset?: number;
  onCreate: (values: RecordValues, kind: RecordKind) => Promise<ActionResult>;
  onUpdate: (values: RecordValues, kind: RecordKind) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  csvHref: string;
  emptyMessage: string;
  /** Başlık şeridine eklenecek sayfaya özel düğmeler (ör. Akbank aktar). */
  extraActions?: React.ReactNode;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState(filters[0]?.value ?? "all");
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [addKind, setAddKind] = useState<RecordKind>(defaultKind);
  const [isPending, startTransition] = useTransition();

  const active = filters.find((f) => f.value === filter) ?? filters[0];

  const [range, setRange] = useState<DateRange>(ALL_TIME);
  /*
   * Aralık dışında başlamış ama hâlâ işleyen aylık kayıtlar (kira, abonelik)
   * varsayılan olarak gizli: tabloda satırın kendi TARİHİ yazıyor ve
   * "Eylül" filtresinde ocak tarihli bir satır görmek kafa karıştırıyor.
   * Ama tamamen yok saymak da yanlış — o kira eylülde de ödeniyor. Çözüm
   * saklamak değil, sayısını söyleyip kararı kullanıcıya bırakmak.
   */
  const [includeOngoing, setIncludeOngoing] = useState(false);

  const byKind = useMemo(
    () => (active ? rows.filter(active.match) : rows),
    [rows, active]
  );

  const inRange = useMemo(
    () =>
      byKind.filter(
        (r) =>
          (range.from === null || r.date >= range.from) &&
          (range.to === null || r.date <= range.to)
      ),
    [byKind, range]
  );

  /** Aralıktan ÖNCE başlamış, hâlâ her ay işleyen kayıtlar. */
  const ongoingBefore = useMemo(() => {
    if (range.from === null) return [];
    return byKind.filter(
      (r) => r.frequency === "MONTHLY" && r.date < range.from!
    );
  }, [byKind, range.from]);

  const visible = useMemo(() => {
    if (!includeOngoing || ongoingBefore.length === 0) return inRange;
    // Tarihe göre azalan: liste zaten sunucudan bu sırada geliyor.
    return [...inRange, ...ongoingBefore].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [inRange, ongoingBefore, includeOngoing]);

  /*
   * "CSV indir" ekranda görüneni indirir. Aralık sunucuya da gönderiliyor:
   * istemcide süzülmüş satırları göndermek, indirilen dosyanın ekrandakiyle
   * tutmasını tesadüfe bırakırdı.
   */
  const csvUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (includeOngoing) params.set("ongoing", "1");
    const query = params.toString();
    return query ? `${csvHref}&${query}` : csvHref;
  }, [csvHref, range, includeOngoing]);

  // Toplam yalnızca baz para birimine çevrilebilen satırlardan kuruluyor.
  // Çevrilemeyeni sayıya katmak, karışık para birimlerini toplamak olurdu.
  const { total, unconverted } = useMemo(() => {
    let sum = 0;
    let missing = 0;
    for (const row of visible) {
      if (row.baseAmount === null) missing++;
      else sum += Number(row.baseAmount);
    }
    return { total: sum, unconverted: missing };
  }, [visible]);

  function remove(row: RecordRow) {
    startTransition(async () => {
      const result = await onDelete(row.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Kayıt silindi");
      router.refresh();
    });
  }

  /*
   * Telefonda da ilk beş kayıt gösteriliyor. Masaüstündeki tablo kendi
   * içinde kaydırılabiliyor ama gruplanmış liste sayfanın kendisini
   * uzatıyor; yüz kayıtta alt gezinme çubuğuna ulaşmak için sayfalarca
   * kaydırmak gerekiyordu.
   */
  const [showAllMobile, setShowAllMobile] = useState(false);
  const mobileRows = showAllMobile
    ? visible
    : visible.slice(0, DEFAULT_VISIBLE_ROWS);

  const grouped = useMemo(() => {
    const map = new Map<string, RecordRow[]>();
    for (const row of mobileRows) {
      const list = map.get(row.date);
      if (list) list.push(row);
      else map.set(row.date, [row]);
    }
    return [...map];
  }, [mobileRows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="text-muted-foreground text-[13px]">
          <strong className="text-foreground">{visible.length}</strong> kayıt
          {visible.length !== rows.length && ` (toplam ${rows.length})`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          <Button asChild variant="outline" size="sm">
            <a href={csvUrl} download>
              CSV indir
            </a>
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setAddKind(defaultKind);
              setAdding(true);
            }}
          >
            {addLabel}
          </Button>
        </div>
      </div>

      <DateRangeFilter value={range} onChange={setRange} />

      {ongoingBefore.length > 0 && (
        <label className="border-border text-muted-foreground flex cursor-pointer flex-wrap items-center gap-2 border px-3 py-2 text-[12px] leading-snug">
          <input
            type="checkbox"
            checked={includeOngoing}
            onChange={(e) => setIncludeOngoing(e.target.checked)}
            className="accent-primary size-4 shrink-0"
          />
          <span>
            Aralıktan önce başlamış{" "}
            <strong className="text-foreground">
              {ongoingBefore.length} aylık tekrarlayan kayıt
            </strong>{" "}
            var (kira, abonelik gibi). Tarihleri eski ama bu aylarda da
            işliyorlar — listeye eklemek için işaretle.
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="border-border flex flex-wrap border">
          {filters.map((f, i) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "min-h-11 px-3 text-[13px] font-semibold sm:min-h-9",
                i > 0 && "border-border border-l",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[13px]">
          <span className="eyebrow mr-1.5 inline">Toplam</span>
          <strong className="text-[15px]">
            {formatMoney(total, baseCurrency)}
          </strong>
          {unconverted > 0 && (
            <span className="text-muted-foreground ml-1.5 text-[12px]">
              ({unconverted} kayıt kur yokluğundan hariç)
            </span>
          )}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground border-border border px-4 py-8 text-center text-[13px]">
          {emptyMessage}
        </p>
      ) : (
        <>
          {/* Masaüstü: tablo. Telefonda yedi sütun 390px'e sığmıyor ve
              yatay kaydırma Düzenle düğmesini ekran dışında bırakıyordu;
              orada aynı veri tarihe göre gruplanmış liste olarak çiziliyor. */}
          <div className="border-border hidden border lg:block">
            <ScrollableTable rowCount={visible.length}>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Not</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead className="text-right">
                    {baseCurrency} karşılığı
                  </TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(row.date)}
                      {row.kind === "card" && row.paymentMonth && (
                        <span className="text-muted-foreground block text-[11px]">
                          ekstre {formatMonth(row.paymentMonth)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{row.categoryName}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[16rem] truncate">
                      {row.note || "—"}
                    </TableCell>
                    <TableCell>
                      <KindBadge row={row} />
                    </TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {formatMoney(row.amount, row.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right whitespace-nowrap">
                      {row.baseAmount === null
                        ? "—"
                        : formatMoney(row.baseAmount, baseCurrency)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(row)}
                      >
                        Düzenle
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => remove(row)}
                      >
                        Sil
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ScrollableTable>
          </div>

          <div className="border-border border lg:hidden">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <p className="bg-muted border-border eyebrow border-b px-3 py-1.5">
                  {formatDate(date)}
                </p>
                <ul className="divide-hairline">
                  {items.map((row) => (
                    <li key={row.id} className="px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[14px] font-semibold">
                          {row.categoryName}
                        </span>
                        <span className="flex-none text-[14px] font-semibold">
                          {formatMoney(row.amount, row.currency)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <KindBadge row={row} />
                          {row.note && (
                            <span className="text-muted-foreground truncate text-[12px]">
                              {row.note}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-none items-center gap-1">
                          {row.baseAmount !== null &&
                            row.currency !== baseCurrency && (
                              <span className="text-muted-foreground text-[12px]">
                                {formatMoney(row.baseAmount, baseCurrency)}
                              </span>
                            )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(row)}
                          >
                            Düzenle
                          </Button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {visible.length > DEFAULT_VISIBLE_ROWS && (
              <button
                type="button"
                onClick={() => setShowAllMobile((v) => !v)}
                aria-expanded={showAllMobile}
                className="hover:bg-muted text-muted-foreground w-full px-3 py-2.5 text-left text-[13px]"
              >
                {showAllMobile
                  ? `İlk ${DEFAULT_VISIBLE_ROWS} kaydı göster`
                  : `Kalan ${visible.length - DEFAULT_VISIBLE_ROWS} kaydı göster`}
              </button>
            )}
          </div>
        </>
      )}

      {/* Pencere her kayıt için yeniden kuruluyor: alanların başlangıç
          değeri yalnızca ilk kuruluşta okunduğu için `key` olmadan ikinci
          kez açılan pencere bir öncekinin değerlerini gösterirdi. */}
      {adding && (
        <RecordDialog
          key={`new-${addKind}`}
          open
          onOpenChange={(o) => !o && setAdding(false)}
          kind={addKind}
          onKindChange={kindSwitchable ? setAddKind : undefined}
          categories={categories}
          statementOffset={statementOffset}
          onSubmit={(values) => onCreate(values, addKind)}
        />
      )}
      {editing && (
        <RecordDialog
          key={editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          kind={editing.kind}
          categories={categories}
          statementOffset={statementOffset}
          initial={{
            id: editing.id,
            categoryId: editing.categoryId,
            amount: editing.amount,
            currency: editing.currency as "TRY" | "USD",
            date: editing.date,
            frequency: editing.frequency,
            note: editing.note ?? "",
            paymentMonth: editing.paymentMonth ?? "",
            installmentCount: editing.installmentCount ?? 1,
          }}
          onSubmit={(values) => onUpdate(values, editing.kind)}
        />
      )}
    </div>
  );
}

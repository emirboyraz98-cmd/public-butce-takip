"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { clearDays, markDays } from "./actions";
import type { DayMark } from "@/lib/salary/markDays";
import {
  DAY_TYPE_LABELS,
  type CalendarDay,
  type MonthCalendar,
} from "@/lib/salary/monthCalendar";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/**
 * Gün kutusunun görünümü.
 *
 * Beş tür, birbirine benzemeyen BEŞ dil konuşuyor — sadece ton farkı değil:
 *   Çalıştı  dolu blok (zemin/yazı ters çevrilmiş), en güçlü varlık
 *   Pazar    çerçeveli + çapraz tarama; dolu değil ama boş da değil
 *   Tatil    doygun kırmızı blok
 *   İzin     soluk kırmızı blok (aynı aileden ama çok daha sönük)
 *   Boş      dolgusuz, kesikli kırmızı çerçeve
 *
 * Önceki sürümde pazar yalnızca ince çerçeveliydi, izin `bg-muted`
 * kullanıyordu ve koyu temada muted (#2d2b2b) ile kart zemini (#201e1d)
 * neredeyse aynı çıkıyordu: üç tür de aynı görünüyordu. Ayırt etme yükü
 * artık tek bir kanalda (renk tonu) değil — dolgu, çerçeve stili, tarama
 * deseni ve kutudaki kelime birlikte taşıyor.
 */
const DAY_STYLE: Record<string, string> = {
  NORMAL: "bg-foreground text-background border-foreground",
  SUNDAY: "bg-card text-foreground border-foreground",
  PUBLIC_HOLIDAY: "bg-primary text-primary-foreground border-primary",
  // Çerçeve dolgudan koyu: soluk izin kutusu hem kart zemininden hem de
  // yan yana duran diğer izin günlerinden ayrılsın. Aynı renk verilince
  // (border-accent) açık temada kutunun kenarı kayboluyordu.
  LEAVE: "bg-accent text-accent-foreground border-accent-foreground/35",
  UNCOVERED: "bg-card text-destructive border-destructive border-dashed",
};

/** Pazarın çapraz taraması. Zemin rengiyle karışıyor ki yazı okunur kalsın. */
const SUNDAY_HATCH = {
  backgroundImage:
    "repeating-linear-gradient(45deg, color-mix(in srgb, var(--foreground) 24%, transparent) 0 2px, transparent 2px 7px)",
} as const;

const LEGEND_ORDER = [
  "NORMAL",
  "SUNDAY",
  "PUBLIC_HOLIDAY",
  "LEAVE",
  "UNCOVERED",
] as const;

function dayKey(day: CalendarDay): keyof typeof DAY_TYPE_LABELS {
  return day.dayType ?? "UNCOVERED";
}

/**
 * Seçime uygulanabilecek işaretler.
 *
 * `WORKED` ilk sırada ve tek başına duruyor: günlük kullanımın tamamı bu.
 * Diğerleri tek türe zorlar ve ikinci sıraya iner — pazarı normal gün
 * saymak gibi istisnai düzeltmeler için.
 */
const PRIMARY_MARKS: { value: DayMark; label: string }[] = [
  { value: "WORKED", label: "Çalışıldı" },
  { value: "LEAVE", label: "İzin" },
];

const FORCE_MARKS: { value: DayMark; label: string }[] = [
  { value: "NORMAL", label: "Normal gün" },
  { value: "SUNDAY", label: "Pazar" },
  { value: "PUBLIC_HOLIDAY", label: "Resmi tatil" },
];

/** İki tarih arasındaki tüm günler (sıra fark etmez). */
function rangeBetween(days: CalendarDay[], a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return days.filter((d) => d.date >= from && d.date <= to).map((d) => d.date);
}

export function SalaryMonthCalendar({
  calendar,
  monthLengthAdjustment,
  today,
}: {
  calendar: MonthCalendar;
  /** Ayı 30 güne getirmek için normal güne eklenen/çıkarılan gün. */
  monthLengthAdjustment: number;
  /** yyyy-MM-dd — sunucudan gelir; istemcide üretmek hidrasyonu bozar. */
  today: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  /** Sürükleme başladığı gün; `null` ise sürükleme yok. */
  const [anchor, setAnchor] = useState<string | null>(null);

  function startSelect(date: string) {
    setAnchor(date);
    setSelected([date]);
  }

  function extendSelect(date: string) {
    if (!anchor) return;
    setSelected(rangeBetween(calendar.days, anchor, date));
  }

  const apply = (
    fn: () => Promise<{ error?: string; warning?: string; info?: string }>
  ) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      if (result.info) toast.info(result.info);
      setSelected([]);
      setAnchor(null);
      router.refresh();
    });

  const anyMarked = calendar.days.some(
    (d) => selected.includes(d.date) && d.dayType !== null
  );

  return (
    <div className="@container/cal">
      <div className="flex flex-col gap-4">
        <div
          className="grid grid-cols-7 gap-1 text-center select-none"
          // Sürükleme ızgaranın DIŞINDA bırakılırsa da bitmeli; yoksa
          // fare tuşu kalkmış olmasına rağmen üzerine gelinen her gün
          // seçime ekleniyordu.
          onPointerUp={() => setAnchor(null)}
          onPointerLeave={() => setAnchor(null)}
        >
          {WEEKDAYS.map((label) => (
            <div key={label} className="eyebrow pb-1">
              {label}
            </div>
          ))}
          {Array.from({ length: calendar.leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {calendar.days.map((day) => {
            const key = dayKey(day);
            const info = DAY_TYPE_LABELS[key];
            const isSelected = selected.includes(day.date);
            const isToday = day.date === today;

            return (
              <button
                key={day.date}
                type="button"
                disabled={isPending}
                aria-pressed={isSelected}
                title={`${day.date} · ${info.label}${
                  day.isHoliday && day.dayType !== "PUBLIC_HOLIDAY"
                    ? " — bu gün ayrıca resmi tatil"
                    : ""
                }`}
                onPointerDown={(e) => {
                  // Tarayıcının kendi sürükle-seç davranışı metin
                  // seçiyordu; yakalama da bizde kalmalı ki parmak
                  // kutudan çıkınca pointermove gelmeye devam etsin.
                  e.preventDefault();
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
                  startSelect(day.date);
                }}
                onPointerEnter={() => extendSelect(day.date)}
                style={key === "SUNDAY" ? SUNDAY_HATCH : undefined}
                className={cn(
                  "relative flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 border-2 leading-none",
                  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                  "disabled:opacity-50",
                  DAY_STYLE[key]
                )}
              >
                {/*
                  Seçim işareti ayrı bir katman.
                  `outline` denendi ve çalışmadı: sınıf listesindeki
                  `outline-none` outline-style'ı kapatıyor, genişlik ve renk
                  verilse de hiçbir şey çizilmiyordu. `box-shadow` de
                  kullanılamıyor — bugünün alt vurgusu orayı tutuyor.

                  Çerçeve `border-current`: kutunun KENDİ yazı rengi, yani
                  hangi türde olursa olsun zeminiyle kontrast garantili.
                  Sabit bir renk (eski hâlinde `--primary`) kırmızı tatil
                  kutusunda görünmez oluyordu.
                */}
                {isSelected && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-[3px] border-2 border-current"
                  />
                )}
                {/*
                  Bugün: alt kenarda kalın bir çizgi. Bu da `bg-current` —
                  eski `--primary` gölgesi kırmızı tatil kutusunda kayboluyor,
                  koyu dolu kutuda ise "çalışılmamış gün" gibi okunuyordu.
                */}
                {isToday && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-2 bottom-[5px] h-[3px] bg-current"
                  />
                )}
                <span className="text-[15px] font-bold tabular-nums">
                  {day.dayOfMonth}
                </span>
                {/* Büyük harf değil: dar ekranda kutu ~43px'e iniyor ve
                    "ÇALIŞTI" oraya sığmayıp "ÇALI…" diye kesiliyordu.
                    Küçük harf aynı kelimeyi belirgin biçimde daraltıyor. */}
                <span className="max-w-full truncate px-0.5 text-[9px] font-semibold opacity-75">
                  {info.short}
                </span>
              </button>
            );
          })}
        </div>

        {/* Kaldırılan dönem tablosunda bir ayı baştan sona işaretlemek tek
            satırdı ("1 Mar – 31 Mar, Çalışıldı"); sürükleyerek 31 kutu
            geçmek onun yerini tutmuyordu. */}
        {selected.length !== calendar.days.length && (
          <button
            type="button"
            onClick={() => setSelected(calendar.days.map((d) => d.date))}
            className="text-accent-text self-start text-[12px] font-semibold underline underline-offset-4"
          >
            Tüm ayı seç
          </button>
        )}

        {/* Seçim paneli ızgaranın hemen altında: seçim yapıldığı anda
            gözün olduğu yerde çıkması gerekiyor. */}
        {selected.length > 0 && (
          <div className="border-foreground space-y-2.5 border-2 px-3 py-2.5">
            <p className="text-[13px] font-semibold">
              {selected.length} gün seçili
              {selected.length > 1 && (
                <span className="text-muted-foreground ml-1.5 font-normal tabular-nums">
                  {selected[0].slice(8)}–{selected[selected.length - 1].slice(8)}
                </span>
              )}
            </p>

            <div className="border-border grid grid-cols-3 border">
              {PRIMARY_MARKS.map((m, i) => (
                <button
                  key={m.value}
                  type="button"
                  disabled={isPending}
                  onClick={() => apply(() => markDays(selected, m.value))}
                  className={cn(
                    "hover:bg-primary hover:text-primary-foreground min-h-11 px-2 text-[13px] font-bold sm:min-h-9",
                    i > 0 && "border-border border-l"
                  )}
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending || !anyMarked}
                onClick={() => apply(() => clearDays(selected))}
                title="Günlerin işaretini kaldır — maaşa hiç katılmazlar"
                className="border-border hover:bg-destructive hover:text-background min-h-11 border-l px-2 text-[13px] font-bold disabled:opacity-40 sm:min-h-9"
              >
                Temizle
              </button>
            </div>

            <p className="text-muted-foreground text-[11px] leading-snug">
              <strong className="text-foreground">Çalışıldı</strong> seçimdeki
              pazarları pazar, resmi tatilleri tatil sayar — her gün kendi
              katsayısıyla ödenir.
            </p>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
              <span className="text-muted-foreground">Tümünü tek türe çek:</span>
              {FORCE_MARKS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  disabled={isPending}
                  onClick={() => apply(() => markDays(selected, m.value))}
                  className="hover:text-foreground text-accent-text font-semibold underline underline-offset-4"
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-muted-foreground hover:text-foreground ml-auto underline underline-offset-4"
              >
                Seçimi bırak
              </button>
            </div>
          </div>
        )}

        <div className="min-w-0 space-y-3">
          {calendar.uncovered.length > 0 && (
            <p className="border-destructive text-foreground border px-3 py-2.5 text-[12px] leading-snug">
              {/* Hiç dokunulmamış ayda otuz tarihi tek tek saymak bilgi
                  değil gürültü; birkaç gün eksikse tam tersi — hangi günler
                  olduğu tek önemli bilgi. */}
              {calendar.uncovered.length === calendar.days.length ? (
                <>
                  Bu ayın <strong>hiçbir günü</strong> işaretlenmemiş.
                </>
              ) : (
                <>
                  Bu ayda <strong>{calendar.uncovered.length} gün</strong> hiç
                  işaretlenmemiş:{" "}
                  {calendar.uncovered.slice(0, 12).map((d) => d.slice(8)).join(", ")}
                  {calendar.uncovered.length > 12 &&
                    ` ve ${calendar.uncovered.length - 12} gün daha`}
                  .
                </>
              )}
              <span className="text-muted-foreground block">
                İşaretsiz günler maaşa hiç katılmaz. Günleri seçip yukarıdaki
                düğmelerle işaretle.
              </span>
            </p>
          )}

          {/* Üç sütun ancak ~384px'ten sonra: dar ekranda "Normal gün"
              etiketi üç sütuna sığmayıp kesiliyordu. */}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] @sm/cal:grid-cols-3">
            {LEGEND_ORDER.map((key) => (
              <li key={key} className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  style={key === "SUNDAY" ? SUNDAY_HATCH : undefined}
                  className={cn(
                    "inline-block size-3.5 shrink-0 border-2",
                    DAY_STYLE[key]
                  )}
                />
                <span className="text-muted-foreground truncate">
                  {DAY_TYPE_LABELS[key].label}
                </span>
                <span className="font-bold tabular-nums">
                  {key === "UNCOVERED"
                    ? calendar.uncovered.length
                    : calendar.counts[key]}
                </span>
              </li>
            ))}
            {/*
              Bugün işareti de açıklamada: alt çizgi bir gün TÜRÜ değil,
              "bugün burası" demek. Listede karşılığı olmayınca kullanıcı
              bunu gün türü sanıp ne olduğunu sormak zorunda kalıyordu.
            */}
            {calendar.days.some((d) => d.date === today) && (
              <li className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="border-border text-foreground relative inline-block size-3.5 shrink-0 border-2"
                >
                  <span className="absolute inset-x-0.5 bottom-0.5 h-[2px] bg-current" />
                </span>
                <span className="text-muted-foreground truncate">Bugün</span>
              </li>
            )}
          </ul>

          <p className="text-muted-foreground text-[12px] leading-snug">
            Bir güne tıkla ya da sürükleyerek aralık seç, sonra durumunu uygula.
            {monthLengthAdjustment !== 0 && (
              <>
                {" "}
                Bordro ayı her zaman 30 gün sayar; bu ay için normal günden{" "}
                <strong>
                  {monthLengthAdjustment > 0
                    ? `${monthLengthAdjustment} gün eklendi`
                    : `${Math.abs(monthLengthAdjustment)} gün düşüldü`}
                </strong>
                , bu yüzden takvimdeki gün sayısı ile hesaba giren gün sayısı
                birbirini tutmaz.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

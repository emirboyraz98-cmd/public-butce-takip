"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

export type DateRange = {
  /** yyyy-MM-dd, dahil. null = alt sınır yok. */
  from: string | null;
  /** yyyy-MM-dd, dahil. null = üst sınır yok. */
  to: string | null;
};

export const ALL_TIME: DateRange = { from: null, to: null };

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Hazır aralıklar.
 *
 * Tarihler tıklandığı anda üretiliyor, render sırasında değil: istemcide
 * `new Date()` ile kurulan bir varsayılan, sunucunun ürettiği HTML ile
 * uyuşmayıp hidrasyonu bozardı. Varsayılan "Tümü" olduğu için ilk çizimde
 * hiç tarih hesaplanmıyor.
 */
const PRESETS: { label: string; build: () => DateRange }[] = [
  {
    label: "Bu ay",
    build: () => {
      const now = new Date();
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: "Geçen ay",
    build: () => {
      const now = new Date();
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    },
  },
  {
    label: "Son 3 ay",
    build: () => {
      const now = new Date();
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: "Bu yıl",
    build: () => {
      const now = new Date();
      return {
        from: iso(new Date(now.getFullYear(), 0, 1)),
        to: iso(new Date(now.getFullYear(), 11, 31)),
      };
    },
  },
];

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const id = useId();
  const isAll = value.from === null && value.to === null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="border-border flex flex-wrap border">
        <button
          type="button"
          aria-pressed={isAll}
          onClick={() => onChange(ALL_TIME)}
          className={cn(
            "min-h-11 px-2.5 text-[12px] font-semibold sm:min-h-9",
            isAll ? "bg-foreground text-background" : "hover:bg-muted"
          )}
        >
          Tümü
        </button>
        {PRESETS.map((preset) => {
          const range = preset.build();
          const active = value.from === range.from && value.to === range.to;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(range)}
              className={cn(
                "border-border min-h-11 border-l px-2.5 text-[12px] font-semibold sm:min-h-9",
                active ? "bg-foreground text-background" : "hover:bg-muted"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Hazır aralıklar günlük kullanımın tamamını karşılıyor; iki tarih
          kutusu "geçen yılın haziranı" gibi tek seferlik sorular için. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={`${id}-from`} className="sr-only">
          Başlangıç tarihi
        </label>
        <input
          id={`${id}-from`}
          type="date"
          value={value.from ?? ""}
          max={value.to ?? undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value || null })}
          className="border-input bg-muted min-h-11 border px-2 text-[13px] sm:min-h-9"
        />
        <span className="text-muted-foreground text-[13px]">–</span>
        <label htmlFor={`${id}-to`} className="sr-only">
          Bitiş tarihi
        </label>
        <input
          id={`${id}-to`}
          type="date"
          value={value.to ?? ""}
          min={value.from ?? undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value || null })}
          className="border-input bg-muted min-h-11 border px-2 text-[13px] sm:min-h-9"
        />
      </div>
    </div>
  );
}

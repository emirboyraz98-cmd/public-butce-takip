"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addMonths, format, subMonths } from "date-fns";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { rememberRange } from "@/lib/dashboard/rangePreference";

/**
 * Hazır aralıklar. `back`/`forward` bugüne GÖRE ay sayısı; ikisi de aynı
 * yapıda tutuluyor ki hangi düğmenin seçili olduğu tek bir karşılaştırmayla
 * bulunabilsin.
 */
const PRESETS = [
  { label: "Son 3 ay", back: 2, forward: 0 },
  { label: "Son 6 ay", back: 5, forward: 0 },
  { label: "Son 1 yıl", back: 11, forward: 0 },
  { label: "+3 ay", back: 2, forward: 3 },
  { label: "+6 ay", back: 2, forward: 6 },
  { label: "+1 yıl", back: 2, forward: 12 },
];

function rangeFor(preset: { back: number; forward: number }, now: Date) {
  return {
    from: format(subMonths(now, preset.back), "yyyy-MM"),
    to: format(addMonths(now, preset.forward), "yyyy-MM"),
  };
}

export function DashboardFilters({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const now = new Date();
  const active = PRESETS.find((p) => {
    const r = rangeFor(p, now);
    return r.from === from && r.to === to;
  });

  // "Özel" hazır aralıklardan hiçbiri tutmuyorsa zaten açık; kullanıcı
  // düğmeye basarak da açabilir. Kapalıyken iki ay seçici yer kaplamıyor.
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || !active;

  function applyRange(newFrom: string, newTo: string) {
    // Seçim çerezde saklanır ki başka sekmeye geçip dönünce aralık korunsun.
    rememberRange({ from: newFrom, to: newTo });

    const params = new URLSearchParams(searchParams.toString());
    params.set("from", newFrom);
    params.set("to", newTo);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showCustom && (
        <div className="flex items-center gap-2">
          <Input
            type="month"
            aria-label="Başlangıç ayı"
            value={from}
            onChange={(e) => applyRange(e.target.value, to)}
            className="w-[9.5rem]"
          />
          <span className="text-muted-foreground text-[13px]">—</span>
          <Input
            type="month"
            aria-label="Bitiş ayı"
            value={to}
            onChange={(e) => applyRange(from, e.target.value)}
            className="w-[9.5rem]"
          />
        </div>
      )}

      {/* Tek çerçeve içinde bitişik düğmeler: teslimdeki segment denetimi.
          Geçmiş ve projeksiyon aralıkları aynı şeridde ama etiketlerdeki
          "+" işareti ileriye baktığını söylüyor. */}
      <div className="border-border flex flex-wrap border">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={active?.label === preset.label}
            onClick={() => {
              const r = rangeFor(preset, new Date());
              setCustomOpen(false);
              applyRange(r.from, r.to);
            }}
            className={cn(
              "border-border min-h-11 border-l px-3 text-[13px] font-semibold first:border-l-0 sm:min-h-9",
              active?.label === preset.label
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={showCustom}
          onClick={() => setCustomOpen((v) => !v)}
          className={cn(
            "border-border min-h-11 border-l px-3 text-[13px] font-semibold sm:min-h-9",
            showCustom ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          Özel
        </button>
      </div>
    </div>
  );
}

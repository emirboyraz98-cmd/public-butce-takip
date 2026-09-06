"use client";

import { useRouter } from "next/navigation";
import { format, startOfYear, subMonths } from "date-fns";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Hazır aralıklar; hepsi bugüne göre. */
const PRESETS = [
  { label: "Bu yıl", range: (now: Date) => ({ from: format(startOfYear(now), "yyyy-MM"), to: format(now, "yyyy-MM") }) },
  { label: "Son 12 ay", range: (now: Date) => ({ from: format(subMonths(now, 11), "yyyy-MM"), to: format(now, "yyyy-MM") }) },
  { label: "Son 6 ay", range: (now: Date) => ({ from: format(subMonths(now, 5), "yyyy-MM"), to: format(now, "yyyy-MM") }) },
];

export function RangeFilters({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const now = new Date();

  const apply = (nextFrom: string, nextTo: string) =>
    router.push(`/reports?from=${nextFrom}&to=${nextTo}`);

  const active = PRESETS.find((p) => {
    const r = p.range(now);
    return r.from === from && r.to === to;
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="month"
          aria-label="Başlangıç ayı"
          value={from}
          onChange={(e) => e.target.value && apply(e.target.value, to)}
          className="w-[9.5rem]"
        />
        <span className="text-muted-foreground text-[13px]">—</span>
        <Input
          type="month"
          aria-label="Bitiş ayı"
          value={to}
          onChange={(e) => e.target.value && apply(from, e.target.value)}
          className="w-[9.5rem]"
        />
      </div>
      <div className="border-border flex flex-wrap border">
        {PRESETS.map((preset, i) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={active?.label === preset.label}
            onClick={() => {
              const r = preset.range(new Date());
              apply(r.from, r.to);
            }}
            className={cn(
              "min-h-11 px-3 text-[13px] font-semibold sm:min-h-9",
              i > 0 && "border-border border-l",
              active?.label === preset.label
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

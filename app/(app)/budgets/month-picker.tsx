"use client";

import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";

/** Bütçe ayının seçicisi; değer adres çubuğunda taşınır ki paylaşılabilsin. */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();

  return (
    <Input
      type="month"
      aria-label="Bütçe ayı"
      value={month}
      onChange={(e) => {
        if (e.target.value) router.push(`/budgets?month=${e.target.value}`);
      }}
      className="w-[9.5rem]"
    />
  );
}

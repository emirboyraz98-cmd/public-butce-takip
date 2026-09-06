"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoanForm } from "./loan-form";
import { LoanTable, type LoanRow } from "./loan-table";

/**
 * Krediler sekmesi: başlıkta ekleme düğmesi, altında liste.
 *
 * Form artık pencerede. Kredi eklemek nadir bir işlem; listeye bakmak sık
 * — beş alanlık bir formun listenin üstünde sürekli durması, asıl içeriği
 * ekranın aşağısına itiyordu.
 */
export function LoansTab({
  loans,
  currentMonth,
}: {
  loans: LoanRow[];
  currentMonth: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="border-border border">
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b-2 px-4 py-3">
        <div>
          <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
            Krediler
          </h2>
          <p className="text-muted-foreground mt-0.5 max-w-prose text-[12px] leading-snug">
            Krediler paralel ilerleyebilir; bir ayın kredi gideri o ay aktif
            olan tüm kredilerin toplamıdır. Taksit tutarı ileride değişecekse
            &quot;Ödeme dönemi ekle&quot; ile yeni bir dönem açarsın — eski
            dönem, yeni dönemin başladığı ayda otomatik kapanır.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Kredi ekle
        </Button>
      </header>

      <div className="p-4">
        <LoanTable loans={loans} currentMonth={currentMonth} />
      </div>

      {/* Pencere her açılışta baştan kuruluyor ki bir önceki denemeden
          kalan değerler görünmesin. */}
      {adding && <LoanForm key="new" open onOpenChange={setAdding} />}
    </section>
  );
}

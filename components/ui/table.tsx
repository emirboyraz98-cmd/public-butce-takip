"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function Table({
  className,
  containerClassName,
  containerStyle,
  ...props
}: React.ComponentProps<"table"> & {
  /** Kaydırma kabına verilir; dikey kaydırma/yükseklik sınırı için. */
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("relative w-full overflow-x-auto", containerClassName)}
      style={containerStyle}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-xs sm:text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // Satır ayracı kart çerçevesinden İNCE: iki kalınlık iki ayrı iş
        // yapıyor, aynı olurlarsa tablo bir çizgi yığınına dönüşüyor.
        "border-hairline hover:bg-foreground/4 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Sütun başlıkları 11px büyük harf, altında 2px güçlü çizgi.
        "text-muted-foreground border-border h-9 border-b-2 px-1 text-left align-middle text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase sm:px-2 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-1 py-2 align-middle whitespace-nowrap sm:px-2 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };

"use client";

import { InfoIcon } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Hesaplanan bir değerin yanına konan bilgi ikonu. Tıklanınca sayı değil,
 * hangi parametrelerin nasıl işlendiğini anlatan bir metin gösterir.
 */
export function CalcInfo({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${title} nasıl hesaplanır`}
          className="text-muted-foreground hover:text-foreground inline-flex align-middle"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-sm">
        <p className="mb-1.5 font-medium">{title}</p>
        <div className="text-muted-foreground space-y-1.5 leading-relaxed">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

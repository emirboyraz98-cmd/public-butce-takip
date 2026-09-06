import * as React from "react";

import { cn } from "@/lib/utils";
import { CollapsibleText } from "@/components/ui/collapsible-text";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        // Kart, zeminden DOLGUYLA değil ÇERÇEVEYLE ayrılıyor: sistemde
        // kart dolgusu = sayfa dolgusu, ayrım 1px çizgi. Gölge ve köşe
        // yarıçapı kaldırıldı; ikisi de dilin dışında.
        "bg-card text-card-foreground border-border flex flex-col gap-4 border py-4 sm:gap-5 sm:py-5",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 sm:px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      // Kart başlıkları 18-20px ve 800 ağırlıkta — hiyerarşi burada kuruluyor.
      className={cn("text-[18px] leading-tight font-extrabold tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      // Kapsayıcı geniş ekranda büyüyor; düz metni onunla birlikte
      // genişletmek satırları okunmaz uzunluğa çıkarırdı. Veri blokları
      // ekranı kullanır, açıklamalar kendi okunabilir genişliğinde kalır.
      className={cn("text-muted-foreground max-w-prose text-sm", className)}
      {...props}
    >
      {/* Açıklamalar telefonda iki satıra kırpılır, "Devamı" ile açılır;
          sm ve üstünde tam metin görünür. Bkz. CollapsibleText. */}
      <CollapsibleText>{children}</CollapsibleText>
    </div>
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-4 sm:px-6", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4 sm:px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Modernist düğme: köşe yarıçapı yok, gölge yok, etiket 800 ağırlıkta.
 *
 * Gölgeler (`shadow-xs`) kaldırıldı — sistem yüksekliği gölgeyle değil
 * çizgiyle anlatıyor; tek bir gölge bile diğer her şeyin yanında yamalı
 * duruyordu. Odak halkası 3px yumuşak halkadan 2px sert çerçeveye döndü:
 * yuvarlatılmamış bir arayüzde yumuşak halka tek "yuvarlak" öğe kalıyordu.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-extrabold transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        destructive: "bg-destructive text-background hover:bg-destructive/88",
        // İkincil düğme dolgusuz: sistemde dolgu birincil eylemin işareti.
        outline: "border border-border hover:bg-foreground/7",
        secondary: "bg-secondary text-secondary-foreground hover:bg-foreground/10",
        ghost: "text-accent-text hover:bg-primary/10",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        // Telefonda 44px dokunma hedefi zorunlu; masaüstünde daha yoğun.
        default: "min-h-11 px-4 py-2 sm:min-h-9 has-[>svg]:px-3",
        sm: "min-h-11 gap-1.5 px-3 text-[13px] sm:min-h-8 has-[>svg]:px-2.5",
        lg: "min-h-12 px-6 text-[15px] sm:min-h-10 has-[>svg]:px-4",
        icon: "size-11 sm:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

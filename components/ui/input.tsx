import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Girdi dolgusu var (--muted) ama kart dolgusu yok: dolgu burada
        // "yazılabilir alan" işareti, yükseklik işareti değil.
        // Telefonda 44px; ayrıca metin 16px altına inmiyor ki iOS odakta
        // sayfayı yakınlaştırmasın.
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-muted border-input flex min-h-11 w-full min-w-0 border px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 md:text-sm",
        // Odakta kırmızı çerçeve — halka değil. Yuvarlatılmamış bir arayüzde
        // yumuşak halka tek yuvarlak öğe kalıyordu.
        "focus-visible:border-ring focus-visible:border-2",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };

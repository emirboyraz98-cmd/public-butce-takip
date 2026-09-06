"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Şifre alanı + göster/gizle düğmesi.
 *
 * Şifre yazarken tek harflik bir hatayı fark etmenin başka yolu yok:
 * kullanıcı ya baştan siliyor ya da yanlış şifreyle deniyor. Düğme
 * alanın İÇİNDE duruyor; yanına koymak alanın genişliğini kırpıyordu.
 */
export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        // Yalnızca görünürlüğü değiştiriyor; form gönderimine ya da
        // sekme sırasına girmesi gerekmiyor.
        tabIndex={-1}
        aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"}
        onClick={() => setVisible((v) => !v)}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center"
      >
        {visible ? (
          <EyeOffIcon className="size-4" />
        ) : (
          <EyeIcon className="size-4" />
        )}
      </button>
    </div>
  );
}

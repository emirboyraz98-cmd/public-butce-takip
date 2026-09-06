"use client";

import { forwardRef, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

/** Girilen metinden sayıya: hem virgül hem nokta ondalık ayracı kabul edilir. */
export function parseDecimalInput(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "" || normalized === "." || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Yalnızca rakam ve TEK bir ondalık ayracı bırakır (ilk ayraçtan sonrakiler atılır). */
export function sanitizeDecimalInput(raw: string): string {
  let seenSeparator = false;
  let out = "";

  for (const char of raw) {
    if (char >= "0" && char <= "9") {
      out += char;
    } else if ((char === "," || char === ".") && !seenSeparator) {
      seenSeparator = true;
      out += char;
    }
  }

  // Alan "0" ile başladığı için üzerine yazınca "017,5" gibi görünüyordu.
  // Baştaki gereksiz sıfırlar atılır; "0,5" ve tek başına "0" korunur.
  return out.replace(/^0+(?=\d)/, "");
}

/**
 * Ondalıklı sayı girişi.
 *
 * `<input type="number">` + `valueAsNumber` ikilisi burada kullanılamaz: kullanıcı
 * "17," yazdığı anda valueAsNumber NaN döner, kontrollü input bunu basınca da
 * yazılan değer silinir — yani ondalık kısmı hiç girilemez. Bu yüzden metin
 * girdisi tutulup (yarım kalmış "17," gibi ara durumlar korunur) sayıya
 * çevrilebildiğinde forma bildirilir. inputMode="decimal" mobilde sayı klavyesi
 * açar; tarayıcı yerel ayarına bağlı virgül/nokta tutarsızlığı da böylece ortadan
 * kalkar.
 */
export const DecimalInput = forwardRef<
  HTMLInputElement,
  {
    value: number | null | undefined;
    onChange: (value: number | null) => void;
  } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">
>(function DecimalInput({ value, onChange, onBlur, ...props }, ref) {
  const [text, setText] = useState(() =>
    value === null || value === undefined ? "" : String(value)
  );

  // Form dışarıdan sıfırlandığında (örn. kayıt sonrası reset) metni de tazele.
  // Kullanıcı yazarken tetiklenmemesi için yalnızca sayısal değer metinden
  // gerçekten farklıysa güncellenir ("17," yazarken value 17 kalır, dokunulmaz).
  useEffect(() => {
    const currentParsed = parseDecimalInput(text);
    const incoming = value === undefined ? null : value;
    if (currentParsed !== incoming) {
      setText(incoming === null ? "" : String(incoming));
    }
    // text kasıtlı olarak bağımlılık değil: her tuş vuruşunda geri yazmamalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const next = sanitizeDecimalInput(e.target.value);
        setText(next);
        onChange(parseDecimalInput(next));
      }}
      onBlur={(e) => {
        // Sadece ayraç kalmışsa ("17," gibi) sondaki ayracı temizle.
        const trimmed = text.replace(/[.,]$/, "");
        if (trimmed !== text) setText(trimmed);
        onBlur?.(e);
      }}
    />
  );
});

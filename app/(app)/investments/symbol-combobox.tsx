"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AssetType } from "@/lib/priceProviders/types";
import type { SymbolPreset } from "@/lib/investments/symbolPresets";
import {
  searchAllSymbols,
  type TypedSymbolResult,
} from "@/lib/investments/symbolSearch";

const ASSET_TYPE_LABELS: Partial<Record<AssetType, string>> = {
  CRYPTO: "kripto",
  STOCK: "hisse",
  ETF: "ETF",
  FOREX: "döviz",
  COMMODITY: "emtia",
};

/**
 * `"assetType" in preset` ile daraltmak alanı `unknown` bırakıyor: birleşim
 * üyelerinden biri anahtarı hiç taşımıyor. Tek yerde açıkça daraltılıyor.
 */
const typeOf = (
  p: SymbolPreset | TypedSymbolResult
): AssetType | undefined =>
  "assetType" in p ? (p as TypedSymbolResult).assetType : undefined;

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

/**
 * Yazdıkça hem sembol koduna (BTC) hem de isme (Bitcoin) göre filtrelenen
 * sabit preset listesiyle birlikte, arka planda Yahoo Finance/CoinGecko'da
 * canlı arama yapan bir kombo kutusu. Böylece presette olmayan herhangi bir
 * gerçek piyasa sembolü de (örn. BIST'ten ECZYT) yazıldıkça listede çıkar.
 * Hiçbir eşleşme bulunamazsa yazılan değer yine de serbestçe seçilebilir.
 */
export const SymbolCombobox = forwardRef<
  HTMLInputElement,
  {
    value: string;
    /**
     * Seçilen sembolün varlık türü de geliyor. Tür artık aramadan ÖNCE
     * seçilmiyor, sonuçtan okunuyor: yanlış tür seçildiğinde aranan sembol
     * hiç bulunmuyordu ve kullanıcı türleri tek tek denemek zorunda
     * kalıyordu. Serbest girişte tür bilinmiyor, `undefined` dönüyor.
     */
    onChange: (value: string, assetType?: AssetType) => void;
    onBlur?: () => void;
    /** Yalnızca sabit preset listesini ve MANUAL durumunu seçmek için. */
    assetType: AssetType;
    presets: SymbolPreset[];
    placeholder?: string;
  } & Omit<
    React.ComponentProps<typeof Input>,
    "value" | "onChange" | "onBlur" | "ref"
  >
>(function SymbolCombobox(
  { value, onChange, onBlur, assetType, presets, placeholder, ...inputProps },
  ref
) {
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<TypedSymbolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const query = value.trim().toLowerCase();
  const requestId = useRef(0);

  useEffect(() => {
    setRemote([]);
    if (assetType === "MANUAL" || query.length < MIN_SEARCH_LENGTH) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      // Tür süzgeci yok: bütün kaynaklar sorgulanıyor.
      const results = await searchAllSymbols(query).catch(() => []);
      if (requestId.current === id) {
        setRemote(results);
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [assetType, query]);

  const localMatches = useMemo(() => {
    if (!query) return presets;
    const startsWith = presets.filter((p) => p.value.toLowerCase().startsWith(query));
    const rest = presets.filter(
      (p) =>
        !p.value.toLowerCase().startsWith(query) &&
        (p.value.toLowerCase().includes(query) || p.label.toLowerCase().includes(query))
    );
    return [...startsWith, ...rest];
  }, [presets, query]);

  const matches = useMemo<(SymbolPreset | TypedSymbolResult)[]>(() => {
    const seen = new Set(localMatches.map((p) => p.value.toLowerCase()));
    const extra = remote.filter((p) => !seen.has(p.value.toLowerCase()));
    return query ? [...localMatches, ...extra] : localMatches;
  }, [localMatches, remote, query]);

  const exactMatch = matches.find((p) => p.value.toLowerCase() === query);

  // Ne sabit listede ne canlı aramada bir eşleşme varsa, yazılan değeri
  // yine de seçilebilir bir satır olarak göster — serbest giriş engellenmesin.
  const customOption: SymbolPreset | null =
    query && !exactMatch ? { value: value.trim().toUpperCase(), label: "Bu sembolü kullan" } : null;

  const filtered = customOption ? [customOption, ...matches] : matches;

  function selectPreset(preset: SymbolPreset | TypedSymbolResult) {
    onChange(preset.value, typeOf(preset));
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        // FormControl'ün verdiği id/aria-* nitelikleri buraya ulaşmalı ki
        // <FormLabel htmlFor> eşleşsin (etikete tıklama ve ekran okuyucu).
        {...inputProps}
        ref={ref}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (exactMatch) selectPreset(exactMatch);
            else if (customOption) selectPreset(customOption);
            else setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (filtered.length > 0 || loading) && (
        <div className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-56 w-full min-w-64 overflow-auto border shadow-md">
          {filtered.map((preset) => {
            const isExact = preset.value.toLowerCase() === query;
            const isCustom = preset === customOption;
            return (
              <button
                key={isCustom ? "__custom__" : preset.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectPreset(preset);
                }}
                className={cn(
                  "hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                  isExact && "bg-accent/60 font-medium"
                )}
              >
                <span className="flex items-center gap-2">
                  <span>{preset.value}</span>
                  {/* Türü satırda göstermek şart: aynı harfleri taşıyan bir
                      coin ile bir hisse yan yana çıkabiliyor. */}
                  {typeOf(preset) && (
                    <span className="border-border text-muted-foreground border px-1 text-[10px] uppercase">
                      {ASSET_TYPE_LABELS[typeOf(preset)!] ?? typeOf(preset)}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-muted-foreground truncate text-xs",
                    isCustom && "italic"
                  )}
                >
                  {isCustom ? "Listede yok — bu sembolü kullan" : preset.label}
                </span>
              </button>
            );
          })}
          {loading && (
            <div className="text-muted-foreground px-3 py-2 text-xs italic">
              Aranıyor…
            </div>
          )}
        </div>
      )}
    </div>
  );
});

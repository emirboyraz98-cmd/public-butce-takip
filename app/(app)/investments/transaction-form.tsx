"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";

import { transactionSchema, type TransactionInput } from "@/lib/validation/investments";
import { SYMBOL_PRESETS } from "@/lib/investments/symbolPresets";
import { createTransaction } from "./actions";
import { SymbolCombobox } from "./symbol-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const ASSET_TYPE_LABELS: Record<TransactionInput["assetType"], string> = {
  CRYPTO: "Kripto",
  STOCK: "Hisse",
  ETF: "ETF",
  FOREX: "Forex",
  COMMODITY: "Emtia",
  MANUAL: "Manuel (fiyat elle girilir)",
};

const SYMBOL_PLACEHOLDERS: Record<TransactionInput["assetType"], string> = {
  CRYPTO: "BTC, ETH...",
  STOCK: "AAPL, THYAO.IS...",
  ETF: "SPY, QQQ...",
  FOREX: "EURUSD=X...",
  COMMODITY: "GC=F (altın), GRAM-ALTIN...",
  MANUAL: "örn. XU100",
};

export function TransactionForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      symbol: "",
      assetType: "CRYPTO",
      side: "BUY",
      quantity: 0,
      pricePerUnit: 0,
      currency: "USD",
      tradedAt: format(new Date(), "yyyy-MM-dd"),
      note: "",
      // Varsayılan kapalı: açık gelseydi gerçek bir alım yapan kişi
      // kapatmayı unutur ve alım nakit akışında hiç görünmezdi.
      isOpening: false,
      proceedsWithdrawn: true,
    },
  });

  const selectedAssetType = useWatch({ control: form.control, name: "assetType" });
  const selectedSide = useWatch({ control: form.control, name: "side" });

  function onSubmit(values: TransactionInput) {
    setServerError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("symbol", values.symbol);
      formData.set("assetType", values.assetType);
      formData.set("side", values.side);
      formData.set("quantity", String(values.quantity));
      formData.set("pricePerUnit", String(values.pricePerUnit));
      formData.set("currency", values.currency);
      formData.set("tradedAt", values.tradedAt);
      if (values.note) formData.set("note", values.note);
      if (values.isOpening) formData.set("isOpening", "true");
      // Yalnızca satışta anlamlı; alışta gönderilmiyor ki sunucuda
      // yanlışlıkla okunmasın.
      if (values.side === "SELL" && values.proceedsWithdrawn === false) {
        formData.set("proceedsWithdrawn", "false");
      }

      const result = await createTransaction({}, formData);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      toast.success(
        values.side === "BUY" ? "Alış işlemi eklendi." : "Satış işlemi eklendi."
      );

      form.reset({
        symbol: "",
        assetType: values.assetType,
        side: values.side,
        quantity: 0,
        pricePerUnit: 0,
        currency: values.currency,
        tradedAt: values.tradedAt,
        note: "",
      });
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <FormField
          control={form.control}
          name="side"
          render={({ field }) => (
            <FormItem>
              <FormLabel>İşlem</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="BUY">Alış</SelectItem>
                  <SelectItem value="SELL">Satış</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sembol</FormLabel>
              <FormControl>
                <SymbolCombobox
                  ref={field.ref}
                  value={field.value}
                  onChange={(value, assetType) => {
                    field.onChange(value);
                    // Arama sonucundan gelen tür alanı da dolduruyor:
                    // kullanıcı türü önceden doğru seçmek zorunda kalmasın.
                    // MANUAL bilerek korunuyor — elle fiyatlanan bir kaydı
                    // arama sonucu ezmemeli.
                    if (assetType && selectedAssetType !== "MANUAL") {
                      form.setValue("assetType", assetType);
                    }
                  }}
                  onBlur={field.onBlur}
                  assetType={selectedAssetType}
                  presets={SYMBOL_PRESETS[selectedAssetType]}
                  placeholder={SYMBOL_PLACEHOLDERS[selectedAssetType]}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="assetType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Varlık Türü</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tradedAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tarih</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Adet</FormLabel>
              <FormControl>
                <DecimalInput
                  placeholder="örn. 17,5"
                  {...field}
                  onChange={(v) => field.onChange(v ?? 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="pricePerUnit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {selectedSide === "BUY" ? "Alış Fiyatı (birim)" : "Satış Fiyatı (birim)"}
              </FormLabel>
              <FormControl>
                <DecimalInput
                  {...field}
                  onChange={(v) => field.onChange(v ?? 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Para Birimi</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="TRY">TRY</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Not (isteğe bağlı)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Yalnızca alışta anlamlı: satıştan gelen para her zaman gerçek bir
            nakit girişidir, alım uygulama dışında yapılmış olsa bile. */}
        {selectedSide === "BUY" && (
          <FormField
            control={form.control}
            name="isOpening"
            render={({ field }) => (
              <FormItem className="lg:col-span-4">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={field.value ?? false}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="border-input mt-0.5 size-4"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Açılış pozisyonu</span>
                    <span className="text-muted-foreground block text-xs">
                      Bu yatırıma uygulamayı kullanmaya başlamadan önce
                      sahiptim. Maliyet ve kâr/zarar hesabına girer, ama Genel
                      Bakış&apos;taki nakit akışına yazılmaz — parası zaten
                      daha önce çıkmıştı.
                    </span>
                  </span>
                </label>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {selectedSide === "SELL" && (
          <FormField
            control={form.control}
            name="proceedsWithdrawn"
            render={({ field }) => (
              <FormItem className="lg:col-span-4">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={field.value ?? true}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="border-input mt-0.5 size-4"
                  />
                  <span className="text-sm">
                    <span className="font-medium">
                      Parayı hesabıma çektim
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      İşaretliyse satış hasılatı Genel Bakış&apos;taki nakit
                      akışına <strong>gelir</strong> olarak girer.
                      İşaretlemezsen para borsada kalmış sayılır: nakit
                      akışına yazılmaz, <strong>serbest nakit</strong> olarak
                      yukarıdaki kutuda görünür ve sonraki alımlarını fonlar.
                    </span>
                  </span>
                </label>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <div className="lg:col-span-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Ekleniyor..." : selectedSide === "BUY" ? "Alış Ekle" : "Satış Ekle"}
          </Button>
          {serverError && (
            <p className="text-destructive mt-2 text-sm">{serverError}</p>
          )}
        </div>
      </form>
    </Form>
  );
}

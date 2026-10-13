"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalcInfo } from "@/components/ui/calc-info";
import { cn } from "@/lib/utils";
import { askAssistant, type AssistantView } from "./assistant-actions";

/** Kutu boşken gösterilen, tıklanınca sorulan örnekler. */
const ORNEKLER = [
  "Bu ay ne kadar harcadım?",
  "Ayın 1'inden beri markete ne kadar harcadım?",
  "En çok neye harcadım?",
  "Geçen aya göre daha mı çok harcadım?",
  "Bu ay ne kadar biriktirdim?",
  "Bütçemi aştım mı?",
];

/**
 * Genel Bakış'taki soru kutusu.
 *
 * API anahtarı ya da dış servis yok: soru kural tabanlı çözümleniyor ve
 * kullanıcının kendi verisiyle cevaplanıyor (bkz. lib/assistant).
 *
 * Cevap bir CÜMLE: sorulan şeyin kendisi vurgulu, sorulmayan döküm yok.
 * Altındaki küçük satır anlaşılan tarih aralığını ve yapılan varsayımı
 * ("zaman belirtmediğin için bu ayı aldım") söylüyor; yanlış anlaşılan bir
 * soru böylece ilk bakışta fark ediliyor.
 */
export function Assistant() {
  const [state, formAction, pending] = useActionState<AssistantView | null, FormData>(askAssistant, null);
  // Kontrollü: soru gönderildikten sonra kutuda kalsın ki küçük bir
  // değişiklikle yeniden sorulabilsin.
  const [soru, setSoru] = useState("");

  function sor(metin: string) {
    setSoru(metin);
    const fd = new FormData();
    fd.set("question", metin);
    startTransition(() => formAction(fd));
  }

  return (
    <section className="border-border border">
      <header className="border-border flex flex-wrap items-center justify-between gap-2 border-b-2 px-4 py-3">
        <h2 className="t-section">Soru sor</h2>
        <CalcInfo title="Bu nasıl çalışıyor">
          <p>
            Soru <strong>hiçbir yere gönderilmiyor</strong>: yapay zekâ servisi
            ya da API anahtarı yok. Soru burada çözümlenip senin kendi
            kayıtlarınla cevaplanıyor.
          </p>
          <p>
            Zamanı (&quot;geçen ay&quot;, &quot;ayın 13&apos;ünden beri&quot;,
            &quot;1-15 ekim&quot;), kategoriyi (&quot;markete&quot;), ödeme
            yolunu (&quot;kartla&quot;) ya da notta geçen bir sözcüğü
            (&quot;konser&quot;) yazabilirsin. Zaman yazmazsan bu ayı alır ve
            bunu söyler.
          </p>
          <p>
            <strong>Harcama</strong> gider kayıtların; kredi taksitleri ancak
            sorulursa girer. <strong>Gelir</strong> gelir kayıtların ile
            ödendiği aya yazılan maaş. <strong>Birikim</strong> ikisinin farkı,
            taksitler dahil.
          </p>
        </CalcInfo>
      </header>

      <div className="space-y-3 p-4">
        <form action={formAction} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="assistant-question">
            Sorun
          </label>
          <Input
            id="assistant-question"
            name="question"
            value={soru}
            onChange={(e) => setSoru(e.target.value)}
            placeholder="Örn. bu ay markete ne kadar harcadım?"
            className="h-10 min-w-[12rem] flex-1"
            autoComplete="off"
            maxLength={300}
          />
          <Button type="submit" disabled={pending || soru.trim() === ""}>
            {pending ? "Bakıyorum…" : "Sor"}
          </Button>
        </form>

        {state === null && <Oneriler baslik="Örnek:" sorular={ORNEKLER} onSec={sor} disabled={pending} />}

        {state && <Cevap view={state} onSec={sor} pending={pending} />}
      </div>
    </section>
  );
}

function Cevap({
  view,
  onSec,
  pending,
}: {
  view: AssistantView;
  onSec: (q: string) => void;
  pending: boolean;
}) {
  const uyari = view.kind === "unparsed" || view.kind === "notFound";
  return (
    <div role="status" aria-live="polite" className={cn("space-y-2", pending && "opacity-60")}>
      <p
        className={cn(
          "text-[15px] leading-relaxed",
          uyari && "border-destructive border-l-2 pl-3"
        )}
      >
        {view.parts.map((p, i) =>
          p.b ? (
            <strong key={i} className="font-bold tabular-nums">
              {p.t}
            </strong>
          ) : (
            <span key={i}>{p.t}</span>
          )
        )}
      </p>

      {view.rows.length > 0 && (
        <ul className="divide-hairline border-border divide-y border">
          {view.rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[13px]">{r.label}</span>
                {r.detail && <span className="t-meta block truncate">{r.detail}</span>}
              </span>
              <span className="flex-none text-[13px] font-semibold tabular-nums">{r.amount}</span>
            </li>
          ))}
          {view.more > 0 && <li className="t-meta px-3 py-2">+{view.more} kalem daha</li>}
        </ul>
      )}

      {view.context.length > 0 && <p className="t-meta">{view.context.join(" · ")}</p>}

      {view.link && (
        <Link
          href={view.link.href}
          className="text-accent-text inline-block text-[13px] font-semibold underline underline-offset-4"
        >
          {view.link.label}
        </Link>
      )}

      {view.suggestions.length > 0 && (
        <Oneriler baslik="Şunları sorabilirsin:" sorular={view.suggestions} onSec={onSec} disabled={pending} />
      )}
    </div>
  );
}

function Oneriler({
  baslik,
  sorular,
  onSec,
  disabled,
}: {
  baslik: string;
  sorular: string[];
  onSec: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="t-meta">{baslik}</span>
      {sorular.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onSec(o)}
          className="border-hairline text-muted-foreground hover:border-border hover:text-foreground border px-2 py-1 text-left text-[12px] transition-colors disabled:opacity-50"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

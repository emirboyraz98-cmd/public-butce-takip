"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalcInfo } from "@/components/ui/calc-info";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { askAssistant, type AssistantResult } from "./assistant-actions";

/** Kutu boşken gösterilen, gerçekten çalışan sorular. */
const ORNEKLER = [
  "ayın 13'ünden beri ne kadar harcadım",
  "bu ay markete ne kadar harcadım",
  "geçen ay net ne kadar kaldı",
  "son 3 ayda en çok nereye harcadım",
];

const BASLIK: Record<string, string> = {
  expense: "Gider",
  income: "Gelir",
  net: "Net",
};

/**
 * Genel Bakış'taki soru kutusu.
 *
 * API anahtarı ya da dış servis yok: soru kural tabanlı çözümleniyor ve
 * kullanıcının kendi verisiyle cevaplanıyor (bkz. lib/assistant). Bunun
 * bedeli dar bir soru dili, kazancı ise verinin hiçbir yere gitmemesi ve
 * aynı sorunun her zaman aynı cevabı vermesi.
 *
 * Cevap, ANLAŞILAN ARALIĞI açıkça yazıyor. Rakamı tek başına göstermek,
 * kullanıcının soruyu doğru anlaşıldığını varsaymasına yol açardı; yanlış
 * yorumlanmış bir soru da emin bir rakam üretir ve kimse kontrol etmez.
 */
export function Assistant({ baseCurrency }: { baseCurrency: string }) {
  const [state, formAction, pending] = useActionState<AssistantResult | null, FormData>(
    askAssistant,
    null
  );

  return (
    <section className="border-border border">
      <header className="border-border flex flex-wrap items-center justify-between gap-2 border-b-2 px-4 py-3">
        <h2 className="t-section">Soru sor</h2>
        <CalcInfo title="Bu nasıl çalışıyor">
          <p>
            Soru <strong>cihazın dışına çıkmıyor</strong>: yapay zekâ servisi
            ya da API anahtarı kullanılmıyor. Soru burada çözümlenip senin
            kendi kayıtlarınla cevaplanıyor.
          </p>
          <p>
            Bunun karşılığı dar bir soru dili: tanımadığı bir kalıpta tahmin
            yürütmek yerine açıkça anlamadığını söyler. Yanlış anlayıp emin
            bir rakam vermek daha kötü olurdu.
          </p>
          <p>
            Rapora <strong>gelir ve gider kayıtların</strong> girer. Kredi
            taksitleri ve hesaplanan maaş ay bazlı tutulduğu için buraya
            girmez; onlar Giderler ve Maaş sekmelerinde.
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
            placeholder="ayın 13'ünden beri ne kadar harcadım?"
            className="h-10 min-w-[12rem] flex-1"
            autoComplete="off"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Bakıyorum…" : "Sor"}
          </Button>
        </form>

        {state === null && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="t-meta">Örnek:</span>
            {ORNEKLER.map((o) => (
              <span
                key={o}
                className="border-hairline text-muted-foreground border px-2 py-0.5 text-[12px]"
              >
                {o}
              </span>
            ))}
          </div>
        )}

        {state?.ok === false && (
          <div
            role="status"
            className="border-destructive text-foreground border px-3 py-2 text-[13px] leading-snug"
          >
            {state.reason === "empty" ? (
              <>Bir soru yaz.</>
            ) : (
              <>
                <strong>Bu soruyu anlayamadım.</strong>
                <span className="text-muted-foreground block">
                  Sorunun bir <strong>zaman</strong> (ayın 13&apos;ünden
                  beri, bu ay, geçen hafta, son 3 ayda, ağustosta) ve bir{" "}
                  <strong>ölçü</strong> (harcama, gelir, net) içermesi
                  gerekiyor. Yanlış anlayıp emin bir rakam vermektense
                  anlamadığımı söylüyorum.
                </span>
              </>
            )}
          </div>
        )}

        {state?.ok && <Rapor report={state.report} baseCurrency={baseCurrency} />}
      </div>
    </section>
  );
}

function Rapor({
  report,
  baseCurrency,
}: {
  report: NonNullable<Extract<AssistantResult, { ok: true }>["report"]>;
  baseCurrency: string;
}) {
  const negatif = Number(report.total) < 0;

  return (
    <div className="space-y-3">
      {/*
        Anlaşılan aralık en üstte ve tam tarihlerle: "ayın 13'ünden beri"
        ifadesinin neye karşılık geldiğini kullanıcı görmeden rakama
        güvenemez.
      */}
      <p className="t-meta">
        {BASLIK[report.metric]}
        {report.categoryQuery && ` · ${report.categoryQuery}`} ·{" "}
        <strong className="text-foreground">{report.rangeLabel}</strong> (
        {formatDate(report.fromLabel)} – {formatDate(report.toLabel)})
      </p>

      {/*
        "En çok nereye harcadım" sorulduysa cevabı KALEM ADIDIR; rakamı tek
        başına göstermek soruyu cevapsız bırakırdı.
      */}
      {report.topCategory ? (
        <div>
          <p className="t-figure text-[32px] leading-none font-extrabold">
            {report.topCategory}
          </p>
          <p className="t-meta mt-1">
            {formatMoney(report.lines[0].amount, baseCurrency)} ·{" "}
            {formatPercent(report.lines[0].share, { digits: 0 })} · toplam{" "}
            {formatMoney(report.total, baseCurrency)}
          </p>
        </div>
      ) : (
        <p
          className={cn(
            "t-figure text-[32px] leading-none font-extrabold tabular-nums",
            negatif && "text-destructive"
          )}
        >
          {formatMoney(report.total, baseCurrency)}
        </p>
      )}

      <p className="t-meta">
        {report.count} kayıt · {report.dayCount} gün · günlük ortalama{" "}
        {formatMoney(report.dailyAverage, baseCurrency)}
        {report.metric === "net" && (
          <>
            {" "}
            · gelir {formatMoney(report.incomeTotal, baseCurrency)} · gider{" "}
            {formatMoney(report.expenseTotal, baseCurrency)}
          </>
        )}
      </p>

      {report.lines.length > 0 && (
        <ul className="divide-hairline border-border border">
          {report.lines.map((l) => (
            <li
              key={l.categoryName}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0 truncate text-[13px]">
                {l.categoryName}
              </span>
              <span className="flex flex-none items-baseline gap-2 tabular-nums">
                <span className="text-muted-foreground text-[12px]">
                  {formatPercent(l.share, { digits: 0 })}
                </span>
                <span className="text-[13px] font-semibold">
                  {formatMoney(l.amount, baseCurrency)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {report.count === 0 ? (
        <p className="t-meta">Bu aralıkta kayıt yok.</p>
      ) : (
        <Link
          href={report.detailsHref}
          className="text-accent-text inline-block text-[13px] font-semibold underline underline-offset-4"
        >
          Bu aralığın kayıtlarını aç
        </Link>
      )}
    </div>
  );
}

import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { FX_CACHE_TTL_MS } from "@/lib/fx/convert";
import { fetchFxRate } from "@/lib/fx/getRate";

/**
 * Herhangi bir para biriminden baz para birimine kur.
 *
 * `lib/fx/convert.ts` yalnızca TRY/USD ikilisini tanıyor; kart mailleri EUR,
 * MAD gibi kodlar taşıyabildiği için burada serbest kod kabul eden ayrı bir
 * yol var. Önbellek aynı tabloyu (`FxRateSnapshot`) paylaşıyor.
 *
 * Kur hiç bulunamazsa BAŞARISIZ döner (null) — çağıran tarafın uydurma bir
 * kurla kayıt açmaması için. Bayat önbellek ise kabul edilir: birkaç saat
 * eski de olsa GERÇEK bir kurdur ve kullanılan kur kayda yazıldığı için
 * sonradan denetlenebilir.
 */
export async function rateToBase(
  from: string,
  to: "TRY" | "USD"
): Promise<Decimal | null> {
  if (from === to) return new Decimal(1);

  const cached = await prisma.fxRateSnapshot.findUnique({
    where: { base_quote: { base: from, quote: to } },
  });

  const isFresh =
    cached && Date.now() - cached.fetchedAt.getTime() < FX_CACHE_TTL_MS;
  if (isFresh) return new Decimal(cached.rate.toString());

  const fetched = await fetchFxRate(from, to);
  if (fetched) {
    const saved = await prisma.fxRateSnapshot.upsert({
      where: { base_quote: { base: from, quote: to } },
      create: { base: from, quote: to, rate: fetched.toString() },
      update: { rate: fetched.toString(), fetchedAt: new Date() },
    });
    return new Decimal(saved.rate.toString());
  }

  return cached ? new Decimal(cached.rate.toString()) : null;
}

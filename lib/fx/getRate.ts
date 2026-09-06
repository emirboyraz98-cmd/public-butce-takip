import Decimal from "decimal.js";

/**
 * Genel döviz kuru (dashboard/portföy toplama noktaları için).
 *
 * Spec'te birincil kaynak olarak belirtilen exchangerate.host artık ücretsiz
 * anahtarsız erişim sunmuyor (APILayer'a taşındı, access key istiyor). Bu
 * yüzden anahtarsız ve stabil olan Frankfurter (ECB kaynaklı) birincil
 * kaynak yapıldı; exchangerate.host sadece EXCHANGERATE_HOST_API_KEY
 * tanımlıysa ikincil yedek olarak denenir.
 */
export async function fetchFxRate(
  base: string,
  quote: string
): Promise<Decimal | null> {
  if (base === quote) return new Decimal(1);

  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      const rate = data.rates?.[quote];
      if (rate) return new Decimal(rate);
    }
  } catch {
    // yedeğe düş
  }

  const apiKey = process.env.EXCHANGERATE_HOST_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(
        `https://api.exchangerate.host/live?access_key=${apiKey}&source=${base}&currencies=${quote}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          quotes?: Record<string, number>;
        };
        const rate = data.quotes?.[`${base}${quote}`];
        if (rate) return new Decimal(rate);
      }
    } catch {
      // aşağıda null dönecek
    }
  }

  return null;
}

import { timingSafeEqual } from "node:crypto";

import { format } from "date-fns";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { refreshPrice } from "@/lib/investments/priceCache";
import { ensureTcmbRatesForMonth } from "@/lib/fx/monthlyAverage";

/**
 * Uzunluk farkı da sızıntıdır: `timingSafeEqual` farklı uzunlukta tampon
 * verilince istisna atar, o yüzden uzunluk önce ayrıca kontrol edilir.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  // KAPALIYA DÜŞER: eskiden anahtar tanımsızsa kontrol tamamen atlanıyordu,
  // yani ortam değişkenini koymayı unutan her kurulumda bu adres internete
  // açık kalıyordu. Sızan veri yok ama fiyat sağlayıcılarına sınırsız istek
  // attırılabiliyordu. Artık anahtar yoksa istek reddedilir.
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const holdings = await prisma.investmentTransaction.findMany({
    distinct: ["symbol", "assetType"],
    select: { symbol: true, assetType: true },
    where: { assetType: { not: "MANUAL" } },
  });

  const failed: string[] = [];
  let refreshed = 0;

  for (const h of holdings) {
    try {
      await refreshPrice(h.symbol, h.assetType);
      refreshed += 1;
    } catch {
      failed.push(h.symbol);
    }
  }

  // Kur arşivini burada sıcak tutuyoruz ki maaş hesabı sayfa açılışında
  // TCMB'ye gitmek zorunda kalmasın. Ay başında bir önceki ay da tazelenir:
  // ayın son günlerinin kuru ancak o gün geçtikten sonra yayımlanıyor.
  const now = new Date();
  const previous = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  const fxMonths = [format(previous, "yyyy-MM"), format(now, "yyyy-MM")];
  const fxFailed: string[] = [];

  for (const month of fxMonths) {
    try {
      await ensureTcmbRatesForMonth(month);
    } catch {
      fxFailed.push(month);
    }
  }

  return NextResponse.json({ refreshed, failed, fxMonths, fxFailed });
}

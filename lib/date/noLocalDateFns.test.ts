import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Takvim aritmetiğinde yerel saatli date-fns fonksiyonlarını yasaklar.
 *
 * `startOfMonth`, `eachDayOfInterval`, `getDay`, `format` çalıştığı
 * makinenin saat dilimine göre davranır. Maaş takvimi istemcide çizildiği
 * için bu, UTC'nin batısında bakan birinin yanlış ayı görmesine yol
 * açıyordu. Düzeltildi; bu test geri sızmasını engelliyor — tek tek
 * testlerle yakalamak, her yeni çağrıyı ayrıca test etmeyi gerektirirdi.
 */
const YASAK = [
  "startOfMonth",
  "endOfMonth",
  "eachDayOfInterval",
  "getDay",
  "isWithinInterval",
  "addMonths",
];

/** Tarih mantığının yaşadığı, saat dilimine duyarlı olmaması gereken yerler. */
const KAPSAM = ["lib/salary", "lib/fx", "lib/cashflow", "lib/date", "lib/loans"];

describe("yerel saatli date-fns kullanımı", () => {
  it("takvim modüllerinde yok", () => {
    const suclular: string[] = [];

    const tsDosyalari = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((girdi) => {
        const yol = join(dir, girdi.name);
        if (girdi.isDirectory()) return tsDosyalari(yol);
        return girdi.name.endsWith(".ts") ? [yol] : [];
      });

    for (const dir of KAPSAM) {
      for (const file of tsDosyalari(dir)) {
        if (file.endsWith(".test.ts")) continue;
        const src = readFileSync(file, "utf-8");
        const importSatiri = src.match(/import\s*\{([^}]*)\}\s*from\s*"date-fns"/);
        if (!importSatiri) continue;
        const adlar = importSatiri[1].split(",").map((s) => s.trim());
        for (const ad of adlar) {
          if (YASAK.includes(ad)) suclular.push(`${file}: ${ad}`);
        }
      }
    }

    expect(
      suclular,
      `Yerel saate bakan date-fns çağrıları bulundu. lib/date/utc.ts içindeki UTC karşılıklarını kullan:\n${suclular.join("\n")}`
    ).toEqual([]);
  });
});

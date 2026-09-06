import { describe, expect, it } from "vitest";

import { applyFxCorrection } from "./fxCorrection";

describe("applyFxCorrection", () => {
  it("scales the nominal total by referenceRate / avgRate", () => {
    // Referans kur ortalama kurdan yüksekse, çalışan lehine (daha çok USD) sonuç çıkmalı
    const result = applyFxCorrection(1000, 53, 50);
    expect(result.toFixed(2)).toBe("1060.00");
  });

  it("returns the nominal total unchanged when reference equals average", () => {
    const result = applyFxCorrection(933.33, 53, 53);
    expect(result.toFixed(2)).toBe("933.33");
  });
});

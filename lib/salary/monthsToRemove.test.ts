import { describe, expect, it } from "vitest";

import { collectMonthsToCompute, monthsToRemove } from "./computeAndSave";

describe("monthsToRemove", () => {
  it("hedef listede olmayan ayları döner", () => {
    expect(
      monthsToRemove(
        ["2026-05", "2026-06", "2027-03", "2027-04"],
        ["2026-05", "2026-06"]
      )
    ).toEqual(["2027-03", "2027-04"]);
  });

  it("her ay kapsanıyorsa boş döner", () => {
    expect(
      monthsToRemove(["2026-05", "2026-06"], ["2026-05", "2026-06", "2026-07"])
    ).toEqual([]);
  });

  it("hiç dönem kalmadıysa tüm ayları döner", () => {
    expect(monthsToRemove(["2026-05", "2026-06"], [])).toEqual([
      "2026-05",
      "2026-06",
    ]);
  });

  it("kayıtlı sonuç yoksa boş döner", () => {
    expect(monthsToRemove([], ["2026-05"])).toEqual([]);
  });

  it("sonucu sıralı döner", () => {
    expect(monthsToRemove(["2027-04", "2026-01", "2027-03"], [])).toEqual([
      "2026-01",
      "2027-03",
      "2027-04",
    ]);
  });

  it("ekran görüntüsündeki durum: silinen dönemin ayları düşer", () => {
    // Kullanıcının dönemleri 2026-05 ile 2027-02-10 arasını kapsıyor, ama
    // daha önce hesaplanmış 2027-03 ve 2027-04 tabloda asılı kalmıştı.
    const target = collectMonthsToCompute(
      [
        { from: "2026-05", to: "2026-07" },
        { from: "2026-07", to: "2026-07" },
        { from: "2026-08", to: "2026-10" },
        { from: "2026-10", to: "2026-10" },
        { from: "2026-10", to: "2027-01" },
        { from: "2027-01", to: "2027-02" },
      ],
      "2026-08"
    );

    const existing = [...target, "2027-03", "2027-04"];

    expect(monthsToRemove(existing, target)).toEqual(["2027-03", "2027-04"]);
    expect(target).toContain("2026-12");
    expect(target).not.toContain("2027-03");
  });
});

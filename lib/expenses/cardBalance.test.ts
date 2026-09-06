import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  assumedPaymentsAfterCarry,
  buildLedger,
  monthSequence,
  ledgerByMonth,
  reconciliationGap,
  type LedgerRow,
} from "./cardBalance";

const months = ["2026-07", "2026-08", "2026-09", "2026-10"];

const dec = (map: Record<string, number>) =>
  new Map(Object.entries(map).map(([k, v]) => [k, new Decimal(v)]));

const run = (
  statements: Record<string, number>,
  payments: Record<string, number> = {}
) =>
  ledgerByMonth(
    buildLedger({
      months,
      statementByMonth: dec(statements),
      paymentByMonth: dec(payments),
    })
  );

describe("monthSequence", () => {
  it("aradaki tüm ayları üretir", () => {
    expect(monthSequence("2026-07", "2026-10")).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("yıl sınırını aşar", () => {
    expect(monthSequence("2026-11", "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("tek ay için tek eleman", () => {
    expect(monthSequence("2026-07", "2026-07")).toEqual(["2026-07"]);
  });

  it("ters aralıkta boş döner", () => {
    expect(monthSequence("2026-10", "2026-07")).toEqual([]);
  });
});

describe("ödeme girilmediğinde eski davranış korunur", () => {
  it("tamamı ödenmiş sayılır, borç birikmez", () => {
    const ledger = run({ "2026-07": 20000, "2026-08": 30000 });

    expect(ledger.get("2026-07")!.paid.toString()).toBe("20000");
    expect(ledger.get("2026-07")!.closingBalance.toString()).toBe("0");
    expect(ledger.get("2026-08")!.paid.toString()).toBe("30000");
    expect(ledger.get("2026-08")!.openingBalance.toString()).toBe("0");
  });

  it("ödemenin varsayım olduğunu işaretler", () => {
    expect(run({ "2026-07": 20000 }).get("2026-07")!.isActual).toBe(false);
  });
});

describe("asgari ödeme — ödenmeyen kısım sonraki aya devreder", () => {
  it("eksik ödenen tutar bir sonraki ayın borcuna eklenir", () => {
    // Temmuz ekstresi 20.000 ama yalnızca 5.000 ödenmiş.
    const ledger = run(
      { "2026-07": 20000, "2026-08": 30000 },
      { "2026-07": 5000 }
    );

    const temmuz = ledger.get("2026-07")!;
    expect(temmuz.due.toString()).toBe("20000");
    expect(temmuz.paid.toString()).toBe("5000");
    expect(temmuz.closingBalance.toString()).toBe("15000");

    const agustos = ledger.get("2026-08")!;
    expect(agustos.openingBalance.toString()).toBe("15000");
    // 15.000 devir + 30.000 ekstre
    expect(agustos.due.toString()).toBe("45000");
    // Ağustosa ödeme girilmediği için tamamı ödenmiş sayılır.
    expect(agustos.paid.toString()).toBe("45000");
    expect(agustos.closingBalance.toString()).toBe("0");
  });

  it("borç birden fazla ay boyunca birikir", () => {
    const ledger = run(
      { "2026-07": 10000, "2026-08": 10000, "2026-09": 10000 },
      { "2026-07": 2000, "2026-08": 3000 }
    );

    expect(ledger.get("2026-08")!.due.toString()).toBe("18000"); // 8.000 + 10.000
    expect(ledger.get("2026-08")!.closingBalance.toString()).toBe("15000");
    expect(ledger.get("2026-09")!.due.toString()).toBe("25000"); // 15.000 + 10.000
  });

  it("hiç ödeme yapılmayan ay borcu olduğu gibi taşır", () => {
    const ledger = run({ "2026-07": 10000, "2026-08": 0 }, { "2026-07": 0 });
    expect(ledger.get("2026-08")!.openingBalance.toString()).toBe("10000");
    expect(ledger.get("2026-08")!.due.toString()).toBe("10000");
  });
});

describe("fazla ödeme — kayıt eksiği işareti", () => {
  // Kullanıcının durumu: kayıtlı harcama 20.000 ama 60.000 ödenmiş.
  const ledger = run(
    { "2026-07": 20000, "2026-08": 30000 },
    { "2026-07": 60000 }
  );

  it("kalan borcu eksi gösterir", () => {
    expect(ledger.get("2026-07")!.closingBalance.toString()).toBe("-40000");
  });

  it("eksi bakiyeyi sonraki ayın borcundan DÜŞMEZ", () => {
    // Eksi bakiye pratikte eksik harcama kaydı demek, gerçek alacak değil;
    // sonraki ayı azaltsa gider olduğundan düşük görünürdü.
    expect(ledger.get("2026-08")!.openingBalance.toString()).toBe("0");
    expect(ledger.get("2026-08")!.due.toString()).toBe("30000");
  });
});

describe("nakit akışı ile kategori listesi arasındaki fark", () => {
  it("fazla ödemede fark pozitif", () => {
    const row = run({ "2026-07": 20000 }, { "2026-07": 60000 }).get("2026-07")!;
    expect(reconciliationGap(row).toString()).toBe("40000");
  });

  it("eksik ödemede fark negatif", () => {
    const row = run({ "2026-07": 20000 }, { "2026-07": 5000 }).get("2026-07")!;
    expect(reconciliationGap(row).toString()).toBe("-15000");
  });

  it("ödeme girilmediğinde fark sıfır", () => {
    const row = run({ "2026-07": 20000 }).get("2026-07")!;
    expect(reconciliationGap(row).toString()).toBe("0");
  });

  it("devreden borç ödendiğinde fark, devir kadar olur", () => {
    // Temmuzda 5.000 ödendi, 15.000 devretti. Ağustos ekstresi 30.000,
    // ödenen 45.000 -> fark 15.000, yani geçen ayın borcu.
    const row = run(
      { "2026-07": 20000, "2026-08": 30000 },
      { "2026-07": 5000 }
    ).get("2026-08")!;
    expect(reconciliationGap(row).toString()).toBe("15000");
  });
});

describe("defter tutarlılığı", () => {
  it("her ay: devreden + ekstre = ödenen + kalan", () => {
    const rows = buildLedger({
      months,
      statementByMonth: dec({ "2026-07": 20000, "2026-08": 30000, "2026-09": 12345.67 }),
      paymentByMonth: dec({ "2026-07": 5000, "2026-09": 1000 }),
    });

    for (const row of rows) {
      expect(
        row.openingBalance.plus(row.statement).toString()
      ).toBe(row.paid.plus(row.closingBalance).toString());
    }
  });

  it("kuruşlu tutarlarda da tutar", () => {
    const rows = buildLedger({
      months: ["2026-07", "2026-08"],
      statementByMonth: dec({ "2026-07": 333.33, "2026-08": 666.67 }),
      paymentByMonth: dec({ "2026-07": 100.01 }),
    });
    expect(rows[1].openingBalance.toString()).toBe("233.32");
    expect(rows[1].due.toString()).toBe("899.99");
  });

  it("boş ay listesi boş defter verir", () => {
    const rows: LedgerRow[] = buildLedger({
      months: [],
      statementByMonth: new Map(),
      paymentByMonth: new Map(),
    });
    expect(rows).toEqual([]);
  });

  it("harcaması olmayan ayı da zincire dahil eder", () => {
    // Aksi halde o ayda devreden borç kaybolurdu.
    const ledger = run({ "2026-07": 10000 }, { "2026-07": 4000 });
    expect(ledger.get("2026-08")!.statement.toString()).toBe("0");
    expect(ledger.get("2026-08")!.due.toString()).toBe("6000");
  });
});

describe("assumedPaymentsAfterCarry", () => {
  const build = (
    statements: [string, number][],
    payments: [string, number][]
  ) =>
    buildLedger({
      months: statements.map(([m]) => m),
      statementByMonth: new Map(
        statements.map(([m, v]) => [m, new Decimal(v)])
      ),
      paymentByMonth: new Map(payments.map(([m, v]) => [m, new Decimal(v)])),
    });

  it("devreden borcu olan ve ödemesi girilmemiş ayı bildirir", () => {
    // Ağustos: 60 ekstre, 10 ödendi → 50 devretti. Eylül girilmedi.
    const rows = build(
      [
        ["2026-08", 60],
        ["2026-09", 60],
      ],
      [["2026-08", 10]]
    );

    const warn = assumedPaymentsAfterCarry(rows, "2026-09");
    expect(warn).toHaveLength(1);
    expect(warn[0].month).toBe("2026-09");
    expect(warn[0].carried.toNumber()).toBe(50);
  });

  it("devreden borç yoksa uyarmaz", () => {
    const rows = build(
      [
        ["2026-08", 60],
        ["2026-09", 60],
      ],
      []
    );

    expect(assumedPaymentsAfterCarry(rows, "2026-09")).toEqual([]);
  });

  it("ödeme girilmişse uyarmaz", () => {
    const rows = build(
      [
        ["2026-08", 60],
        ["2026-09", 60],
      ],
      [
        ["2026-08", 10],
        ["2026-09", 110],
      ]
    );

    expect(assumedPaymentsAfterCarry(rows, "2026-09")).toEqual([]);
  });

  it("içinde bulunulan ve gelecek aylar için uyarmaz", () => {
    const rows = build(
      [
        ["2026-08", 60],
        ["2026-09", 60],
        ["2026-10", 60],
      ],
      [["2026-08", 10]]
    );

    // Eylül henüz kapanmadıysa uyarı yok
    expect(assumedPaymentsAfterCarry(rows, "2026-08")).toEqual([]);
    // Ekim ayındayken eylül için uyarılır, ekim için değil
    const warn = assumedPaymentsAfterCarry(rows, "2026-09");
    expect(warn.map((w) => w.month)).toEqual(["2026-09"]);
  });

  it("zincirin koptuğu İLK ayı bildirir, sonrasını değil", () => {
    // Temmuz: 100 ekstre, 40 ödendi → 60 devretti.
    // Ağustos: ödeme girilmedi, 60 ödendi VARSAYILDI → devir sıfırlandı.
    // Eylül artık temiz görünür; sorun ağustosta başlıyor.
    const rows = build(
      [
        ["2026-07", 100],
        ["2026-08", 0],
        ["2026-09", 0],
      ],
      [["2026-07", 40]]
    );

    // Kullanıcının düzeltmesi gereken yer ağustos: orayı düzeltirse devir
    // yeniden kurulur ve gerekirse eylül de uyarı verir.
    expect(
      assumedPaymentsAfterCarry(rows, "2026-09").map((w) => w.month)
    ).toEqual(["2026-08"]);
  });

  it("art arda eksik ödemede her ayı bildirir", () => {
    const rows = build(
      [
        ["2026-07", 100],
        ["2026-08", 100],
        ["2026-09", 100],
      ],
      [
        ["2026-07", 40],
        ["2026-08", 50],
      ]
    );

    // Temmuz 60 devretti, ağustos (60+100−50)=110 devretti; eylül girilmedi.
    const warn = assumedPaymentsAfterCarry(rows, "2026-09");
    expect(warn.map((w) => w.month)).toEqual(["2026-09"]);
    expect(warn[0].carried.toNumber()).toBe(110);
  });
});

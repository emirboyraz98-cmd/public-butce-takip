import { describe, expect, it } from "vitest";

import { findApplicableByPeriod, periodsOverlap, resolveOverlaps } from "./effectiveRate";

describe("findApplicableByPeriod", () => {
  const entries = [
    {
      id: "a",
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: new Date("2026-03-31T00:00:00Z"),
    },
    {
      id: "b",
      effectiveFrom: new Date("2026-04-01T00:00:00Z"),
      effectiveTo: null,
    },
  ];

  it("finds the entry whose bounded period contains the date", () => {
    expect(findApplicableByPeriod(new Date("2026-02-15T00:00:00Z"), entries)?.id).toBe("a");
  });

  it("finds the open-ended entry when the date is after its start", () => {
    expect(findApplicableByPeriod(new Date("2026-08-01T00:00:00Z"), entries)?.id).toBe("b");
  });

  it("returns null when the date is before any period starts", () => {
    expect(findApplicableByPeriod(new Date("2025-12-01T00:00:00Z"), entries)).toBeNull();
  });

  it("matches the final month of a bounded period even when the lookup date carries an end-of-day time (e.g. from date-fns endOfMonth)", () => {
    // effectiveTo comes back from Postgres @db.Date columns normalized to
    // UTC midnight, but callers sometimes look up with `endOfMonth(...)`
    // which lands on the same calendar day at 23:59:59.999 local time.
    // These must still be treated as the same day.
    const lookupDate = new Date("2026-03-31T23:59:59.999Z");
    expect(findApplicableByPeriod(lookupDate, entries)?.id).toBe("a");
  });

  it("returns null when the date falls in a gap between bounded periods", () => {
    const gappedEntries = [
      {
        id: "a",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveTo: new Date("2026-01-31T00:00:00Z"),
      },
      {
        id: "b",
        effectiveFrom: new Date("2026-03-01T00:00:00Z"),
        effectiveTo: null,
      },
    ];
    expect(
      findApplicableByPeriod(new Date("2026-02-15T00:00:00Z"), gappedEntries)
    ).toBeNull();
  });
});

describe("periodsOverlap", () => {
  it("detects overlap between two bounded periods", () => {
    const a = {
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: new Date("2026-03-01T00:00:00Z"),
    };
    const b = {
      effectiveFrom: new Date("2026-02-01T00:00:00Z"),
      effectiveTo: new Date("2026-04-01T00:00:00Z"),
    };
    expect(periodsOverlap(a, b)).toBe(true);
  });

  it("detects no overlap between adjacent non-touching periods", () => {
    const a = {
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: new Date("2026-01-31T00:00:00Z"),
    };
    const b = {
      effectiveFrom: new Date("2026-02-01T00:00:00Z"),
      effectiveTo: null,
    };
    expect(periodsOverlap(a, b)).toBe(false);
  });

  it("treats an open-ended period as overlapping anything starting after it", () => {
    const a = {
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
    };
    const b = {
      effectiveFrom: new Date("2030-01-01T00:00:00Z"),
      effectiveTo: null,
    };
    expect(periodsOverlap(a, b)).toBe(true);
  });
});

describe("resolveOverlaps", () => {
  it("truncates an open-ended earlier period when a later open-ended period is added", () => {
    const existing = [
      {
        id: "old",
        effectiveFrom: new Date("2026-08-01T00:00:00Z"),
        effectiveTo: null,
      },
    ];
    const newPeriod = {
      effectiveFrom: new Date("2027-01-01T00:00:00Z"),
      effectiveTo: null,
    };
    const result = resolveOverlaps(existing, newPeriod);
    expect(result.deleteIds).toEqual([]);
    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([
      {
        id: "old",
        effectiveFrom: new Date("2026-08-01T00:00:00Z"),
        effectiveTo: new Date("2026-12-31T00:00:00Z"),
      },
    ]);
  });

  it("deletes an existing period fully contained within the new period", () => {
    const existing = [
      {
        id: "old",
        effectiveFrom: new Date("2026-03-01T00:00:00Z"),
        effectiveTo: new Date("2026-05-31T00:00:00Z"),
      },
    ];
    const newPeriod = {
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
    };
    const result = resolveOverlaps(existing, newPeriod);
    expect(result.deleteIds).toEqual(["old"]);
    expect(result.updates).toEqual([]);
    expect(result.creates).toEqual([]);
  });

  it("pushes the start of a later period forward when a new period ends inside it", () => {
    const existing = [
      {
        id: "old",
        effectiveFrom: new Date("2026-02-01T00:00:00Z"),
        effectiveTo: null,
      },
    ];
    const newPeriod = {
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: new Date("2026-03-31T00:00:00Z"),
    };
    const result = resolveOverlaps(existing, newPeriod);
    expect(result.deleteIds).toEqual([]);
    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([
      {
        id: "old",
        effectiveFrom: new Date("2026-04-01T00:00:00Z"),
        effectiveTo: null,
      },
    ]);
  });

  it("splits an existing period in two when the new period lands in the middle", () => {
    const existing = [
      {
        id: "old",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveTo: new Date("2026-12-31T00:00:00Z"),
      },
    ];
    const newPeriod = {
      effectiveFrom: new Date("2026-06-01T00:00:00Z"),
      effectiveTo: new Date("2026-06-30T00:00:00Z"),
    };
    const result = resolveOverlaps(existing, newPeriod);
    expect(result.deleteIds).toEqual([]);
    expect(result.updates).toEqual([
      {
        id: "old",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveTo: new Date("2026-05-31T00:00:00Z"),
      },
    ]);
    expect(result.creates).toEqual([
      {
        effectiveFrom: new Date("2026-07-01T00:00:00Z"),
        effectiveTo: new Date("2026-12-31T00:00:00Z"),
        source: existing[0],
      },
    ]);
  });

  it("returns no changes when periods don't overlap", () => {
    const existing = [
      {
        id: "old",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveTo: new Date("2026-01-31T00:00:00Z"),
      },
    ];
    const newPeriod = {
      effectiveFrom: new Date("2026-02-01T00:00:00Z"),
      effectiveTo: null,
    };
    const result = resolveOverlaps(existing, newPeriod);
    expect(result).toEqual({ deleteIds: [], updates: [], creates: [] });
  });
});

/**
 * Türkiye resmi tatil takvimi (2026-2030). Dini bayramların (Ramazan/Kurban)
 * tarihleri Diyanet'in hicri takvim hesaplarına göredir ve yıl içinde resmi
 * duyuru ile 1 gün kayabilir. Arife günleri, bu uygulamanın maaş hesaplama
 * mantığı gereği tam resmi tatil olarak sayılır (bkz. dailyFormula.ts).
 */
export const BUILT_IN_HOLIDAYS: { date: string; name: string }[] = [
  ...[2026, 2027, 2028, 2029, 2030].flatMap((year) => [
    { date: `${year}-01-01`, name: "Yılbaşı" },
    { date: `${year}-04-23`, name: "Ulusal Egemenlik ve Çocuk Bayramı" },
    { date: `${year}-05-01`, name: "Emek ve Dayanışma Günü" },
    { date: `${year}-05-19`, name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
    { date: `${year}-07-15`, name: "Demokrasi ve Milli Birlik Günü" },
    { date: `${year}-08-30`, name: "Zafer Bayramı" },
    { date: `${year}-10-29`, name: "Cumhuriyet Bayramı" },
  ]),

  // Ramazan Bayramı (arife + 3 gün)
  { date: "2026-03-19", name: "Ramazan Bayramı Arifesi" },
  { date: "2026-03-20", name: "Ramazan Bayramı (1. gün)" },
  { date: "2026-03-21", name: "Ramazan Bayramı (2. gün)" },
  { date: "2026-03-22", name: "Ramazan Bayramı (3. gün)" },

  { date: "2027-03-08", name: "Ramazan Bayramı Arifesi" },
  { date: "2027-03-09", name: "Ramazan Bayramı (1. gün)" },
  { date: "2027-03-10", name: "Ramazan Bayramı (2. gün)" },
  { date: "2027-03-11", name: "Ramazan Bayramı (3. gün)" },

  { date: "2028-02-26", name: "Ramazan Bayramı Arifesi" },
  { date: "2028-02-27", name: "Ramazan Bayramı (1. gün)" },
  { date: "2028-02-28", name: "Ramazan Bayramı (2. gün)" },
  { date: "2028-02-29", name: "Ramazan Bayramı (3. gün)" },

  { date: "2029-02-14", name: "Ramazan Bayramı Arifesi" },
  { date: "2029-02-15", name: "Ramazan Bayramı (1. gün)" },
  { date: "2029-02-16", name: "Ramazan Bayramı (2. gün)" },
  { date: "2029-02-17", name: "Ramazan Bayramı (3. gün)" },

  { date: "2030-02-03", name: "Ramazan Bayramı Arifesi" },
  { date: "2030-02-04", name: "Ramazan Bayramı (1. gün)" },
  { date: "2030-02-05", name: "Ramazan Bayramı (2. gün)" },
  { date: "2030-02-06", name: "Ramazan Bayramı (3. gün)" },

  // Kurban Bayramı (arife + 4 gün)
  { date: "2026-05-26", name: "Kurban Bayramı Arifesi" },
  { date: "2026-05-27", name: "Kurban Bayramı (1. gün)" },
  { date: "2026-05-28", name: "Kurban Bayramı (2. gün)" },
  { date: "2026-05-29", name: "Kurban Bayramı (3. gün)" },
  { date: "2026-05-30", name: "Kurban Bayramı (4. gün)" },

  { date: "2027-05-15", name: "Kurban Bayramı Arifesi" },
  { date: "2027-05-16", name: "Kurban Bayramı (1. gün)" },
  { date: "2027-05-17", name: "Kurban Bayramı (2. gün)" },
  { date: "2027-05-18", name: "Kurban Bayramı (3. gün)" },
  { date: "2027-05-19", name: "Kurban Bayramı (4. gün)" },

  { date: "2028-05-04", name: "Kurban Bayramı Arifesi" },
  { date: "2028-05-05", name: "Kurban Bayramı (1. gün)" },
  { date: "2028-05-06", name: "Kurban Bayramı (2. gün)" },
  { date: "2028-05-07", name: "Kurban Bayramı (3. gün)" },
  { date: "2028-05-08", name: "Kurban Bayramı (4. gün)" },

  { date: "2029-04-23", name: "Kurban Bayramı Arifesi" },
  { date: "2029-04-24", name: "Kurban Bayramı (1. gün)" },
  { date: "2029-04-25", name: "Kurban Bayramı (2. gün)" },
  { date: "2029-04-26", name: "Kurban Bayramı (3. gün)" },
  { date: "2029-04-27", name: "Kurban Bayramı (4. gün)" },

  { date: "2030-04-12", name: "Kurban Bayramı Arifesi" },
  { date: "2030-04-13", name: "Kurban Bayramı (1. gün)" },
  { date: "2030-04-14", name: "Kurban Bayramı (2. gün)" },
  { date: "2030-04-15", name: "Kurban Bayramı (3. gün)" },
  { date: "2030-04-16", name: "Kurban Bayramı (4. gün)" },
];

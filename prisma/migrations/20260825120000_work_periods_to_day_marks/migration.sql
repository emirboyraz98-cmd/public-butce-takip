-- Çalışma/izin dönemleri artık takvimden gün gün işaretleniyor; aralık
-- tablosu arayüzden kaldırıldı. Mevcut dönemler kaybolmasın diye burada
-- gün gün SalaryDayException satırlarına açılıyor.
--
-- Tip ataması classifyDay ile birebir aynı sırayı izler: izin dönemi her
-- günü izin yapar; çalışma döneminde önce pazar, sonra resmi tatil, kalan
-- günler normal. Sıra bozulursa tatile denk gelen pazarlar 22.5 yerine
-- 18.75 katsayısından ödenir ve geçmiş aylar sessizce değişirdi.
--
-- ON CONFLICT DO NOTHING: elle girilmiş gün istisnaları dönemi ezerdi
-- (classifyDay'de istisna en yüksek öncelikliydi), o öncelik burada da
-- korunuyor.
INSERT INTO "SalaryDayException" ("id", "userId", "date", "dayType", "note", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id" || d::text),
  p."userId",
  d::date,
  (CASE
    WHEN p."type" = 'LEAVE' THEN 'LEAVE'
    WHEN EXTRACT(DOW FROM d) = 0 THEN 'SUNDAY'
    WHEN EXISTS (SELECT 1 FROM "PublicHoliday" h WHERE h."date" = d::date) THEN 'PUBLIC_HOLIDAY'
    ELSE 'NORMAL'
  END)::"SalaryDayType",
  p."note",
  now(),
  now()
FROM "WorkPeriod" p
CROSS JOIN LATERAL generate_series(p."startDate", p."endDate", interval '1 day') AS d
ON CONFLICT ("userId", "date") DO NOTHING;

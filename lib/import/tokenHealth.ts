/**
 * Aktarım anahtarının "hâlâ çalışıyor mu" durumu.
 *
 * Apps Script, yeni mail olmasa bile 10 dakikada bir yoklama gönderiyor ve
 * sunucu her istekte `lastUsedAt` damgasını tazeliyor. Yani bu damga bir
 * canlılık sinyali: ilerlemiyorsa script sunucuya hiç ulaşmıyor demektir.
 *
 * Bu sessiz bir arıza tipiydi. Google, üst üste hata veren zamanlanmış
 * tetikleyicileri kendiliğinden devre dışı bırakıyor; aktarım duruyor ama
 * uygulamada hiçbir şey değişmiyor, kullanıcı ancak haftalar sonra
 * "harcamalarım gelmiyor" diye fark ediyor. Damga zaten kayıtlıydı,
 * kimse ona bakmıyordu.
 */
export type TokenHealth =
  /** Hiç istek gelmemiş — kurulum tamamlanmamış olabilir. */
  | { state: "never" }
  /** Son yoklama beklenen aralıkta. */
  | { state: "ok"; hoursAgo: number }
  /** Uzun süredir yoklama yok; tetikleyici durmuş olabilir. */
  | { state: "stale"; hoursAgo: number };

/**
 * Kaç saat sessizlikten sonra uyarılacağı.
 *
 * Tetikleyici 10 dakikada bir koşuyor, yani teorik eşik çok daha düşük.
 * Ama Apps Script zamanlanmış işleri kota baskısında erteleyebiliyor ve
 * birkaç koşunun atlanması olağan. Altı saat, "gecikme" ile "durmuş"u
 * ayıracak kadar geniş: otuz altı koşu üst üste kaçırılmadan buraya
 * gelinmiyor.
 */
export const STALE_AFTER_HOURS = 6;

export function importTokenHealth(
  lastUsedAt: Date | string | null,
  now: Date = new Date()
): TokenHealth {
  if (lastUsedAt === null) return { state: "never" };

  const last =
    typeof lastUsedAt === "string" ? new Date(lastUsedAt) : lastUsedAt;
  if (Number.isNaN(last.getTime())) return { state: "never" };

  // Negatif fark (saat kayması, ileri tarihli damga) sessizce sıfıra
  // çekiliyor: "-3 saat önce" yazmak, uyarıdan daha kafa karıştırıcı.
  const hoursAgo = Math.max(
    0,
    (now.getTime() - last.getTime()) / (1000 * 60 * 60)
  );

  return hoursAgo >= STALE_AFTER_HOURS
    ? { state: "stale", hoursAgo }
    : { state: "ok", hoursAgo };
}

/** "3 saat", "2 gün" — uyarı metninde süreyi okunur yazmak için. */
export function describeSilence(hoursAgo: number): string {
  if (hoursAgo < 1) return "1 saatten az";
  if (hoursAgo < 48) return `${Math.floor(hoursAgo)} saat`;
  return `${Math.floor(hoursAgo / 24)} gün`;
}

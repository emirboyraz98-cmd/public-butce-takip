import { nextMonth } from "./schedule";

/**
 * Ödeme döneminin bitişini düzenlemek.
 *
 * `LoanPeriod` yalnızca başlangıç ayını saklar; bitiş türetilir — bir dönem,
 * bir sonraki dönem başlayana kadar geçerlidir, son dönem de kredinin
 * bitişine kadar. Bu tasarım bilinçli: iki dönem ne çakışabilir ne de
 * aralarında kapsanmayan ay kalabilir.
 *
 * Bitişi ayrıca saklamak bu güvenceyi kaldırırdı (kullanıcı 07–09 ile 08–12
 * girip çakışma, ya da 07–08 ile 10–12 girip boşluk yaratabilirdi ve o
 * aylarda taksit belirsiz kalırdı). Onun yerine bitiş alanı KOMŞUYU yazar:
 *
 *   - Sonraki dönem varsa: onun başlangıcı `bitiş + 1 ay` olur.
 *   - Son dönemse: kredinin bitiş ayı güncellenir.
 *
 * Böylece kullanıcı bitişi doğrudan düzenler ama zincir kesintisiz kalır.
 */

export type PeriodLike = {
  id: string;
  /** yyyy-MM */
  effectiveFrom: string;
};

export type PeriodEndChange =
  | { kind: "nextPeriodStart"; periodId: string; newStart: string }
  | { kind: "loanEndMonth"; newEndMonth: string };

export type ResolveResult =
  | { ok: true; change: PeriodEndChange | null }
  | { ok: false; error: string };

/**
 * Verilen dönemin bitişi `newEnd` yapılmak istendiğinde hangi kaydın
 * değişmesi gerektiğini söyler. Değişiklik gerekmiyorsa `change: null`.
 *
 * `periods` düzenlenen dönemin GÜNCEL başlangıcıyla birlikte, başlangıç
 * ayına göre sıralı verilmelidir.
 */
export function resolvePeriodEndChange({
  periods,
  periodId,
  newEnd,
  loanEndMonth,
}: {
  periods: readonly PeriodLike[];
  periodId: string;
  /** yyyy-MM */
  newEnd: string;
  /** Kredinin bitiş ayı; süresiz kredide null. */
  loanEndMonth: string | null;
}): ResolveResult {
  const sorted = [...periods].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  );
  const index = sorted.findIndex((p) => p.id === periodId);
  if (index === -1) return { ok: false, error: "Dönem bulunamadı" };

  const current = sorted[index];
  if (newEnd < current.effectiveFrom) {
    return {
      ok: false,
      error: "Dönem bitişi, başlangıcından önce olamaz",
    };
  }

  const next = sorted[index + 1];

  // Son dönem: bitişi kredinin bitişidir.
  if (!next) {
    if (loanEndMonth === newEnd) return { ok: true, change: null };
    return { ok: true, change: { kind: "loanEndMonth", newEndMonth: newEnd } };
  }

  const newStart = nextMonth(newEnd);
  if (newStart === next.effectiveFrom) return { ok: true, change: null };

  // Sonraki dönem, ondan sonrakini geçemez; geçerse sıra bozulur ve
  // aradaki dönem kapsamsız kalır.
  const afterNext = sorted[index + 2];
  if (afterNext && newStart >= afterNext.effectiveFrom) {
    return {
      ok: false,
      error: `Bu bitiş sonraki dönemleri karıştırır: ${next.effectiveFrom} ile başlayan dönem ${afterNext.effectiveFrom}'i geçemez. Önce onları düzenle.`,
    };
  }

  if (loanEndMonth && newStart > loanEndMonth) {
    return {
      ok: false,
      error: "Bu bitiş, sonraki dönemi kredinin dışına taşır",
    };
  }

  return {
    ok: true,
    change: { kind: "nextPeriodStart", periodId: next.id, newStart },
  };
}

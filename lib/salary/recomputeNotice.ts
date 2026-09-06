import { recomputeAllMonths } from "./computeAndSave";

export type RecomputeNotice = {
  /** Hesaplanamayan aylar — kullanıcıya uyarı olarak gösterilir. */
  warning?: string;
  /** Sorun değil ama görünmesi gereken sonuç (örn. silinen aylar). */
  info?: string;
};

/**
 * Kaynak veri her değiştiğinde çağrılan yeniden hesaplamayı sarar ve
 * sonucunu kullanıcıya gösterilebilir mesajlara çevirir. Hesaplama
 * başarısız olsa bile çağıran aksiyonun kendisi başarılı sayılır; bu yüzden
 * hata fırlatmaz.
 */
export async function safeRecompute(userId: string): Promise<RecomputeNotice> {
  try {
    const summary = await recomputeAllMonths(userId);

    // Kapsamı kalmayan aylar sessizce silinmemeli: kullanıcı bir dönemi
    // sildiğinde tablodan hangi ayların düştüğünü görsün.
    const info =
      summary.removed.length > 0
        ? `Dönemi kalmayan ${summary.removed.length} ay sonuçlardan kaldırıldı: ${summary.removed.join(", ")}`
        : undefined;

    if (summary.failed.length > 0) {
      const [first] = summary.failed;
      return {
        info,
        warning:
          summary.failed.length === 1
            ? first.error
            : `${first.error} (+${summary.failed.length - 1} ay daha hesaplanamadı)`,
      };
    }

    return { info };
  } catch (err) {
    return {
      warning:
        err instanceof Error ? err.message : "Otomatik hesaplama başarısız oldu",
    };
  }
}

/** Birden fazla bilgi mesajını tek satırda birleştirir. */
export function joinInfo(
  ...parts: (string | undefined)[]
): string | undefined {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length > 0 ? kept.join(" ") : undefined;
}

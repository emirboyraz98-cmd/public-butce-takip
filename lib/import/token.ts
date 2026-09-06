import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Dış aracın (Gmail'deki Apps Script) kimliğini taşıyan anahtar.
 *
 * Biçim: `<tokenId>.<secret>`
 *
 * İki parçalı olmasının sebebi: gizli kısım yalnızca ÖZET olarak saklandığı
 * için onunla satır aranamaz. `tokenId` ile satır bulunur, `secret` sabit
 * zamanlı karşılaştırılır. Tek parça olsaydı ya anahtarı düz metin saklamak
 * ya da her istekte tüm anahtarları taramak gerekirdi.
 *
 * Gizli kısım 32 bayt rastgele; parola değil, sözlük saldırısına açık bir
 * yapısı yok. Bu yüzden bcrypt'in yavaşlığına gerek yok — anahtar her 10
 * dakikada bir kullanılacak ve bcrypt her isteğe ~200ms eklerdi.
 */
export type ParsedToken = { tokenId: string; secret: string };

const SECRET_BYTES = 32;

export function generateImportToken(tokenId: string): {
  /** Kullanıcıya BİR KEZ gösterilecek tam anahtar. */
  plaintext: string;
  /** Veritabanına yazılacak özet. */
  secretHash: string;
} {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return {
    plaintext: `${tokenId}.${secret}`,
    secretHash: hashSecret(secret),
  };
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * `Authorization: Bearer <token>` başlığından anahtarı çıkarır.
 *
 * Biçimi bozuk olan her şey null döner; çağıran tarafın "acaba boş mu"
 * diye ayrıca bakmasına gerek kalmasın diye ayrıştırma tek yerde.
 */
export function parseAuthorizationHeader(header: string | null): ParsedToken | null {
  if (!header) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;

  // Gizli kısım base64url olduğu için nokta içermez; ilk noktadan bölmek
  // güvenli. Yine de fazladan nokta gelirse reddediyoruz.
  const parts = match[1].split(".");
  if (parts.length !== 2) return null;

  const [tokenId, secret] = parts;
  if (!tokenId || !secret) return null;

  return { tokenId, secret };
}

/**
 * Sunulan gizli kısım kayıtlı özetle uyuşuyor mu.
 *
 * Karşılaştırma özetler üzerinden yapılır: ikisi de sabit uzunlukta olduğu
 * için `timingSafeEqual` uzunluk istisnası atmaz ve gizli kısmın uzunluğu
 * da sızmaz.
 */
export function secretMatchesHash(secret: string, storedHash: string): boolean {
  const provided = Buffer.from(hashSecret(secret), "hex");
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

/**
 * Türkçe Excel için CSV üretimi.
 *
 * Excel'in Türkçe yerel ayarında sütun ayracı noktalı virgül, ondalık ayracı
 * virgüldür. Virgülle ayrılmış bir dosya tek sütuna yapıştığı için burada
 * noktalı virgül kullanılır. Dosyanın başına BOM eklenir; yoksa Excel
 * dosyayı Latin-1 sanıp Türkçe karakterleri bozuyor.
 */

export const CSV_DELIMITER = ";";
export const UTF8_BOM = "﻿";

/** Ayraç, tırnak veya satır sonu içeren değerler tırnaklanır. */
export function escapeCsvValue(value: string): string {
  if (!/[";\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Sayıyı Türkçe ondalık ayracıyla yazar; Excel sayı olarak tanısın diye. */
export function formatCsvNumber(value: string | number): string {
  return String(value).replace(".", ",");
}

/**
 * `2026-08-03` → `03.08.2026`.
 *
 * ISO biçimi Excel'in Türkçe yerel ayarında TARİH olarak tanınmıyor, metin
 * olarak kalıyordu: sütun tarihe göre sıralanamıyor, ay/yıl süzgeci
 * kurulamıyor, pivot tabloya tarih ekseni olarak girmiyordu.
 */
export function formatCsvDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

/**
 * `2026-08` → `08.2026`.
 *
 * Ay sütunu da metin olarak kalıyordu. Nokta ile yazınca Excel onu ayın
 * ilk günü sayıp tarih ekseni kuruyor; sıralama da doğal sırada kalıyor.
 */
export function formatCsvMonth(month: string): string {
  const [year, monthNum] = month.split("-");
  if (!year || !monthNum) return month;
  return `${monthNum}.${year}`;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvValue(cell ?? "")).join(CSV_DELIMITER)
  );
  // Excel satır sonu olarak CRLF bekler.
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}

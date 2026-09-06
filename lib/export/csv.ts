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

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvValue(cell ?? "")).join(CSV_DELIMITER)
  );
  // Excel satır sonu olarak CRLF bekler.
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}

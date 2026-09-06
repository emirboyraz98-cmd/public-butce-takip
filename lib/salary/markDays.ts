import type { DayType } from "./dailyFormula";
import { isSunday, toDateKey } from "./holidayCalendar";

/**
 * Takvimden bir aralığa uygulanabilecek işaretler.
 *
 * `WORKED` bir gün tipi DEĞİL, "bu günlerde işbaşındaydım" demek: her günün
 * tipi ayrı belirlenir. Kaldırılan çalışma dönemleri de tam olarak bunu
 * yapıyordu (bkz. classifyDay) — aralık "Çalışıldı" işaretlenince içindeki
 * pazarlar pazar, resmi tatiller tatil ücretinden ödeniyordu. Seçime tek tip
 * yazsaydık, bir ayı seçip "Çalışıldı" diyen kullanıcı pazarlarını sessizce
 * normal güne düşürüp parasını kaybederdi.
 *
 * Diğer işaretler tipin kendisidir ve seçimdeki her güne olduğu gibi yazılır:
 * kullanıcı bilerek "burası izin/tatil/normal gün" diyor.
 */
export type DayMark = "WORKED" | DayType;

export const DAY_MARKS = [
  "WORKED",
  "NORMAL",
  "SUNDAY",
  "PUBLIC_HOLIDAY",
  "LEAVE",
] as const;

export function dayTypeForMark(
  date: Date,
  mark: DayMark,
  holidayDateKeys: ReadonlySet<string>
): DayType {
  if (mark !== "WORKED") return mark;
  // Pazar, resmi tatilden önce: ikisi çakıştığında pazar katsayısı (22.5)
  // tatilinkinden (18.75) yüksek ve classifyDay de bu sırayı kullanıyor.
  if (isSunday(date)) return "SUNDAY";
  if (holidayDateKeys.has(toDateKey(date))) return "PUBLIC_HOLIDAY";
  return "NORMAL";
}

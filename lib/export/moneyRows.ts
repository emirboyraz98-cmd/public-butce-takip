import Decimal from "decimal.js";

import {
  installmentSchedule,
  type LoanScheduleInput,
} from "@/lib/loans/schedule";
import {
  installmentMonths,
  monthOf,
  splitInstallments,
} from "@/lib/expenses/creditCard";
import { formatCsvDate, formatCsvMonth, formatCsvNumber } from "./csv";

/**
 * İki ayrı dosya, iki ayrı soru.
 *
 * Eskiden tek tablo vardı ve ikisinin arasında kalmıştı: kredi taksitleri
 * aylara yayılıyor, aylık tekrarlayan giderler (kira, abonelik) tek satırda
 * duruyordu. "2026'da kiraya ne verdim" sorusuna cevap yoktu; üstelik her
 * satır tipi kendi sütunlarını boş bırakıyordu.
 *
 *   KAYIT DÖKÜMÜ  — 1 kayıt = 1 satır. Ekranda gördüğün listenin aynısı.
 *   AYLIK DÖKÜM   — 1 ay × 1 kalem = 1 satır. Tekrarlayanlar ve taksitler
 *                   aylara yayılır; Excel'de pivot tablo kurulacak dosya bu.
 */

/** Tutarı baz para birimine çeviren fonksiyon; kur yoksa null döndürür. */
export type ToBase = (
  amount: Decimal,
  currency: string,
  month: string
) => Decimal | null;

export type ExportEntry = {
  /** yyyy-MM-dd */
  date: string;
  categoryName: string;
  amount: string;
  currency: string;
  frequency: "ONE_TIME" | "MONTHLY";
  note: string | null;
};

export type ExportExpense = ExportEntry & {
  kind: "OTHER" | "CREDIT_CARD";
  paymentMonth: string | null;
  installmentCount: number;
};

export type ExportLoan = LoanScheduleInput & { paidMonths: string[] };

export type ExportSalary = {
  /** yyyy-MM */
  month: string;
  mode: "FIXED" | "VARIABLE";
  currency: string;
  total: string;
  actualAmount: string | null;
};

export type ExportInvestment = {
  /** yyyy-MM-dd */
  date: string;
  type: "BUY" | "SELL";
  symbol: string;
  assetType: string;
  quantity: string;
  price: string;
  currency: string;
  note: string | null;
};

function row(values: (string | null)[]): string[] {
  return values.map((v) => v ?? "");
}

/**
 * Baz para birimi karşılığı — dosyadaki TEK toplanabilir sütun.
 *
 * Tutar sütunu kaydın kendi para birimindedir ve 29,90 USD ile 18.000 TRY
 * yan yana durur; o sütunu toplamak anlamsız bir sayı üretir. Excel'de
 * SUM/pivot bu sütunla kurulur.
 */
function baseCell(
  amount: Decimal | string,
  currency: string,
  month: string,
  toBase: ToBase
): string | null {
  const converted = toBase(new Decimal(amount), currency, month);
  return converted === null ? null : formatCsvNumber(converted.toFixed(2));
}

// ---------------------------------------------------------------- kayıt dökümü

export function recordHeaders(baseCurrency: string): string[] {
  return [
    "Tür",
    "Tarih",
    "Ay",
    "Kategori",
    "Tutar",
    "Para Birimi",
    `Tutar (${baseCurrency})`,
    "Tekrar",
    "Ödeme Ayı",
    "Taksit",
    "Not",
  ];
}

/**
 * Ekrandaki listenin birebir karşılığı: her kayıt tek satır.
 *
 * Aylık tekrarlayan kayıt burada da tek satırdır — "Tekrar" sütunu Aylık
 * yazar. Kaç ay işlediğini görmek isteyen aylık dökümü indirir; ikisini
 * karıştırmak, kullanıcının girdiği 12 kaydı 40 satır olarak görüp
 * "ben bunları girmedim" demesine yol açıyordu.
 */
export function buildRecordRows({
  incomes,
  expenses,
  baseCurrency,
  toBase,
}: {
  incomes: ExportEntry[];
  expenses: ExportExpense[];
  baseCurrency: string;
  toBase: ToBase;
}): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];

  for (const e of incomes) {
    const month = monthOf(e.date);
    rows.push(
      row([
        "Gelir",
        formatCsvDate(e.date),
        formatCsvMonth(month),
        e.categoryName,
        formatCsvNumber(e.amount),
        e.currency,
        baseCell(e.amount, e.currency, month, toBase),
        e.frequency === "MONTHLY" ? "Aylık" : "Tek seferlik",
        null,
        null,
        e.note,
      ])
    );
  }

  for (const e of expenses) {
    const month = monthOf(e.date);
    rows.push(
      row([
        e.kind === "CREDIT_CARD" ? "Kredi Kartı" : "Gider",
        formatCsvDate(e.date),
        formatCsvMonth(month),
        e.categoryName,
        formatCsvNumber(e.amount),
        e.currency,
        baseCell(e.amount, e.currency, month, toBase),
        e.frequency === "MONTHLY" ? "Aylık" : "Tek seferlik",
        e.paymentMonth ? formatCsvMonth(e.paymentMonth) : null,
        e.installmentCount > 1 ? String(e.installmentCount) : null,
        e.note,
      ])
    );
  }

  // Tarihe göre eskiden yeniye: Excel'de ilk açılışta doğal sıra.
  rows.sort((a, b) => isoOf(a[1]).localeCompare(isoOf(b[1])));
  return { headers: recordHeaders(baseCurrency), rows };
}

/** `03.08.2026` → `2026-08-03`; sıralama için geri çevirir. */
function isoOf(trDate: string): string {
  const [day, month, year] = trDate.split(".");
  return year && month && day ? `${year}-${month}-${day}` : trDate;
}

// ---------------------------------------------------------------- aylık döküm

export function monthlyHeaders(baseCurrency: string): string[] {
  return [
    "Ay",
    "Yön",
    "Tür",
    "Kalem",
    "Tutar",
    "Para Birimi",
    `Tutar (${baseCurrency})`,
    "Açıklama",
  ];
}

/**
 * Her ay gerçekten ne oldu — pivot tablo için.
 *
 * Aylık tekrarlayan kayıtlar başladıkları aydan `asOfMonth`'a kadar her ay
 * bir satır üretir; taksitli kart harcamaları taksit aylarına bölünür;
 * kredi taksitleri kendi takvimine yayılır; maaş hak edildiği ayda görünür.
 * Böylece "Ay" sütununu pivotun satır eksenine, baz para birimi sütununu
 * değer alanına koymak yetiyor.
 */
export function buildMonthlyRows({
  incomes,
  expenses,
  loans,
  salaries,
  asOfMonth,
  baseCurrency,
  toBase,
}: {
  incomes: ExportEntry[];
  expenses: ExportExpense[];
  loans: ExportLoan[];
  salaries: ExportSalary[];
  /** Açık uçlu tekrarların kesileceği ay (genelde içinde bulunulan ay). */
  asOfMonth: string;
  baseCurrency: string;
  toBase: ToBase;
}): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];

  const push = (
    month: string,
    direction: "Gelir" | "Gider",
    kind: string,
    label: string,
    amount: Decimal | string,
    currency: string,
    note: string | null
  ) => {
    rows.push(
      row([
        formatCsvMonth(month),
        direction,
        kind,
        label,
        formatCsvNumber(new Decimal(amount).toFixed(2)),
        currency,
        baseCell(amount, currency, month, toBase),
        note,
      ])
    );
  };

  for (const e of incomes) {
    for (const month of monthsOf(e, asOfMonth)) {
      push(month, "Gelir", "Gelir", e.categoryName, e.amount, e.currency, e.note);
    }
  }

  for (const e of expenses) {
    if (e.kind === "CREDIT_CARD") {
      /*
       * Kart harcaması EKSTRENİN ÖDENDİĞİ aya yazılır, alındığı aya değil;
       * taksitli alışveriş de taksit aylarına bölünür. Bu dosya nakit akışı
       * sorusuna cevap veriyor ("o ay cebimden ne çıktı") ve Genel Bakış ile
       * aynı kuralı kullanmak zorunda — aksi halde aynı harcama iki ekranda
       * iki ayrı ayda görünürdü.
       *
       * "Hangi ay ne satın aldım" sorusu farklıdır; onun cevabı kayıt
       * dökümündeki Tarih sütunudur.
       */
      const months = installmentMonths({
        date: e.date,
        paymentMonth: e.paymentMonth,
        installmentCount: e.installmentCount,
        frequency: e.frequency,
        amount: e.amount,
      });
      const parts = splitInstallments(e.amount, e.installmentCount);

      months.forEach((month, index) => {
        push(
          month,
          "Gider",
          "Kredi Kartı",
          e.categoryName,
          parts[index] ?? new Decimal(0),
          e.currency,
          e.installmentCount > 1
            ? `${index + 1}/${e.installmentCount}. taksit${e.note ? ` — ${e.note}` : ""}`
            : e.note
        );
      });
      continue;
    }

    for (const month of monthsOf(e, asOfMonth)) {
      push(month, "Gider", "Gider", e.categoryName, e.amount, e.currency, e.note);
    }
  }

  for (const loan of loans) {
    const schedule = installmentSchedule(loan, asOfMonth, loan.paidMonths);

    if (schedule.length === 0) {
      // Bitiş ayı girilmemiş kredinin takvimi sonsuz; tek satırla belirtilir.
      rows.push(
        row([
          formatCsvMonth(loan.startMonth),
          "Gider",
          "Kredi Taksiti",
          loan.name,
          null,
          loan.currency,
          null,
          "Süresiz kredi — bitiş ayı girilmedi",
        ])
      );
      continue;
    }

    for (const item of schedule) {
      push(
        item.month,
        "Gider",
        "Kredi Taksiti",
        loan.name,
        item.amount,
        loan.currency,
        item.paid ? "Ödendi olarak işaretli" : null
      );
    }
  }

  for (const s of salaries) {
    // Gerçekleşen girilmişse cebe giren odur; hesaplanan tutar açıklamada
    // kalır ki fark görünsün.
    const amount = s.actualAmount ?? s.total;
    push(
      s.month,
      "Gelir",
      "Maaş",
      s.mode === "FIXED" ? "Maaş (sabit)" : "Maaş (gün bazlı)",
      amount,
      s.currency,
      s.actualAmount === null
        ? "Hesaplanan — banka tutarı girilmedi"
        : `Gerçekleşen (hesaplanan: ${formatCsvNumber(s.total)})`
    );
  }

  rows.sort((a, b) => monthKey(a[0]).localeCompare(monthKey(b[0])));
  return { headers: monthlyHeaders(baseCurrency), rows };
}

/** `08.2026` → `2026-08`; sıralama için geri çevirir. */
function monthKey(trMonth: string): string {
  const [month, year] = trMonth.split(".");
  return year && month ? `${year}-${month}` : trMonth;
}

/**
 * Bir kaydın hangi aylarda geçerli olduğu.
 *
 * Tek seferlik kayıt yalnızca kendi ayında; aylık tekrarlayan kayıt
 * başladığı aydan `asOfMonth`'a kadar her ay. `asOfMonth` geçmişte kalmış
 * bir kayıttan önceyse liste boş döner (gelecekte girilmiş kayıt).
 */
function monthsOf(
  entry: { date: string; frequency: "ONE_TIME" | "MONTHLY" },
  asOfMonth: string
): string[] {
  const start = monthOf(entry.date);
  if (entry.frequency === "ONE_TIME") return [start];
  if (start > asOfMonth) return [start];

  const months: string[] = [];
  let [year, month] = start.split("-").map(Number);
  while (true) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > asOfMonth) break;
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

// ---------------------------------------------------------------- yatırımlar

export const INVESTMENT_HEADERS = [
  "Tarih",
  "Ay",
  "İşlem",
  "Sembol",
  "Varlık Türü",
  "Adet",
  "Birim Fiyat",
  "Para Birimi",
  "Tutar",
  "Not",
];

export function buildInvestmentRows(
  transactions: ExportInvestment[]
): string[][] {
  return transactions
    .map((t) =>
      row([
        formatCsvDate(t.date),
        formatCsvMonth(monthOf(t.date)),
        t.type === "BUY" ? "Alış" : "Satış",
        t.symbol,
        t.assetType,
        formatCsvNumber(t.quantity),
        formatCsvNumber(t.price),
        t.currency,
        formatCsvNumber(
          new Decimal(t.quantity).mul(new Decimal(t.price)).toFixed(2)
        ),
        t.note,
      ])
    )
    .sort((a, b) => isoOf(a[0]).localeCompare(isoOf(b[0])));
}

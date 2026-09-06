import Decimal from "decimal.js";

import { appliesToMonth } from "./calculations";
import { salaryForCashMonth } from "./salaryTiming";
import { statementTotalsByCurrency } from "@/lib/expenses/creditCard";
import {
  buildLedger,
  ledgerByMonth,
  monthSequence,
} from "@/lib/expenses/cardBalance";
import { loanEntriesForMonth, type LoanInput } from "@/lib/loans/schedule";
import {
  monthlyInvestmentFlows,
  type InvestmentTransactionLike,
} from "@/lib/investments/cashFlow";

/**
 * Bir ayın gelir ve gider toplamları — nakit akışı tabanıyla.
 *
 * "Nakit akışı tabanı" demek: para ne zaman elden çıktı/eline geçti. Kart
 * harcaması ekstrenin ÖDENDİĞİ ayda, maaş ÖDENDİĞİ ayda sayılır. Bütçeler
 * sayfası bilerek başka bir taban kullanıyor (harcamanın yapıldığı tarih);
 * ikisi farklı soruları yanıtlıyor ve karıştırılmamalı.
 *
 * Genel Bakış aynı kuralları kendi döngüsünde uyguluyor ve ek olarak kaynak
 * kırılımı üretiyor; buradaki fonksiyon o kırılıma ihtiyaç duymayan
 * sayfalar (Raporlar) için aynı sonucu tek çağrıda veriyor.
 */
export type MonthlyTotalsInput = {
  months: readonly string[];
  incomeEntries: readonly {
    date: Date;
    frequency: "ONE_TIME" | "MONTHLY";
    amount: string;
    currency: string;
  }[];
  expenses: readonly {
    date: Date;
    frequency: "ONE_TIME" | "MONTHLY";
    amount: string;
    currency: string;
    kind: "OTHER" | "CREDIT_CARD";
    paymentMonth: string | null;
    installmentCount: number;
  }[];
  loans: LoanInput[];
  /**
   * Kullanıcının girdiği gerçek ekstre ödemeleri. Nakit akışı ekstrenin
   * TUTARINI değil ÖDENENİ kullanır: asgari ödeme yapılan bir ayda cepten
   * çıkan para ekstreden azdır, kalan sonraki aya devreder.
   */
  cardPayments?: readonly {
    month: string;
    amount: string;
    currency: string;
  }[];
  /** yyyy-MM -> {amount, currency}; hak ediş ayına göre. */
  salaryByAccrualMonth: ReadonlyMap<string, { amount: string; currency: string }>;
  /** Maaş hak edildikten kaç ay sonra ödeniyor. */
  salaryOffset: number;
  /**
   * Yatırım işlemleri. Yatırım gider değil ama NAKİT HAREKETİ: cepten
   * çıkan para gidere, yatırımdan çekilen para gelire yazılır. Genel Bakış
   * bunu hep yapıyordu; burada olmayınca Raporlar aynı ayı farklı
   * gösteriyordu — satış yaptığı ay artıda olan kullanıcı Raporlar'da
   * eksi görüyordu.
   */
  investments?: InvestmentTransactionLike[];
  toBase: (amount: Decimal, currency: string, month: string) => Decimal;
};

export type MonthlyTotals = {
  month: string;
  income: Decimal;
  expenses: Decimal;
};

export function monthlyTotals(input: MonthlyTotalsInput): MonthlyTotals[] {
  const {
    months,
    incomeEntries,
    expenses,
    loans,
    salaryByAccrualMonth,
    salaryOffset,
    investments = [],
    cardPayments = [],
    toBase,
  } = input;

  /*
   * Kart ekstre defteri. Devir zinciri doğru kurulsun diye defter SEÇİLEN
   * ARALIKTAN geniş bir dönem üzerinden hesaplanıyor: ocakta ödenmeyen borç
   * şubatın ödemesini büyütüyor ve aralık şubattan başlıyorsa o bağ
   * kopardı.
   */
  const cardExpenses = expenses.filter((e) => e.kind === "CREDIT_CARD");
  const cardInputs = cardExpenses.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    paymentMonth: e.paymentMonth,
    frequency: e.frequency,
    amount: e.amount,
    installmentCount: e.installmentCount,
    currency: e.currency,
  }));

  const anchors = [
    ...cardInputs.map((c) => c.paymentMonth ?? c.date.slice(0, 7)),
    ...cardPayments.map((p) => p.month),
    ...months,
  ];
  const ledgerMonths =
    anchors.length > 0
      ? monthSequence(
          anchors.reduce((a, b) => (a < b ? a : b)),
          anchors.reduce((a, b) => (a > b ? a : b))
        )
      : [];

  const statements = statementTotalsByCurrency(cardInputs, ledgerMonths);
  const cardCurrencies = [
    ...new Set([
      ...cardInputs.map((c) => c.currency),
      ...cardPayments.map((p) => p.currency),
    ]),
  ];
  const cardLedgers = new Map(
    cardCurrencies.map((currency) => [
      currency,
      ledgerByMonth(
        buildLedger({
          months: ledgerMonths,
          statementByMonth: statements.get(currency) ?? new Map(),
          paymentByMonth: new Map(
            cardPayments
              .filter((p) => p.currency === currency)
              .map((p) => [p.month, new Decimal(p.amount)])
          ),
        })
      ),
    ])
  );

  const investmentFlows = monthlyInvestmentFlows({
    transactions: investments,
    months: [...months],
    toBase,
  });

  return months.map((month) => {
    const otherIncome = incomeEntries
      .filter((e) => appliesToMonth(e, month))
      .reduce(
        (acc, e) => acc.plus(toBase(new Decimal(e.amount), e.currency, month)),
        new Decimal(0)
      );

    const { amount: salary } = salaryForCashMonth({
      cashMonth: month,
      offset: salaryOffset,
      salaryByAccrualMonth,
      toBase,
    });

    const cashExpenses = expenses
      .filter((e) => e.kind === "OTHER" && appliesToMonth(e, month))
      .reduce(
        (acc, e) => acc.plus(toBase(new Decimal(e.amount), e.currency, month)),
        new Decimal(0)
      );

    // Kart tarafında cepten çıkan, defterdeki ÖDENEN tutardır: ekstrenin
    // kendisi değil. Kısmi ödeme yapılan ayda az, devreden borcun kapandığı
    // ayda fazla olur.
    let cardPaid = new Decimal(0);
    for (const [currency, ledger] of cardLedgers) {
      const row = ledger.get(month);
      if (!row) continue;
      cardPaid = cardPaid.plus(toBase(row.paid, currency, month));
    }

    const loanPayments = loanEntriesForMonth(loans, month).reduce(
      (acc, entry) => acc.plus(toBase(entry.amount, entry.currency, month)),
      new Decimal(0)
    );

    /*
     * Aylık alım/satım NETLEŞTİRİLİYOR: aynı ay içinde 300 bin satıp 400
     * bin almak, 100 binlik tek bir çıkıştır. Brüt yazmak sütunları
     * paranın kendi içinde dönmesiyle şişiriyordu.
     */
    const flow = investmentFlows.get(month);
    const netInvested = flow?.netInvested ?? new Decimal(0);
    const investmentOut = Decimal.max(netInvested, 0);
    const investmentIn = Decimal.max(netInvested.neg(), 0);

    return {
      month,
      income: salary.plus(otherIncome).plus(investmentIn),
      expenses: cashExpenses
        .plus(cardPaid)
        .plus(loanPayments)
        .plus(investmentOut),
    };
  });
}

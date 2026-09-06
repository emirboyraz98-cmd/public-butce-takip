import Decimal from "decimal.js";
import { format } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrRefreshPriceWithStatus } from "@/lib/investments/priceCache";
import { computeHoldingPL } from "@/lib/investments/calculations";
import { freeCashBalance } from "@/lib/investments/cashFlow";
import { derivePositions, openPositions } from "@/lib/investments/positions";
import {
  computeMonthlySeries,
  type PriceLookup,
} from "@/lib/investments/monthlySeries";
import { convert } from "@/lib/fx/convert";
import { formatMoneyWhole, formatSignedWhole } from "@/lib/format";
import { CalcInfo } from "@/components/ui/calc-info";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { CategoryPieChart } from "@/components/charts/CategoryPieChart";
import { PortfolioTrendChart } from "@/components/charts/PortfolioTrendChart";
import { TransactionForm } from "./transaction-form";
import { TransactionLog, type TransactionRow } from "./transaction-log";
import { HoldingsTable, type HoldingRow } from "./holdings-table";
import { RefreshButton } from "./refresh-button";
import { ManualPriceForm } from "./manual-price-form";

export default async function InvestmentsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true },
    }),
    prisma.investmentTransaction.findMany({
      where: { userId },
      orderBy: [{ tradedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const baseCurrency = user.baseCurrency;

  // Toplamlar tek para biriminde anlamlı olur: her pozisyon kendi para
  // biriminden kullanıcının baz para birimine çevrilip toplanır.
  //
  // Kur kaynağına ulaşılamazsa (ve cache de boşsa) sayfanın tamamen
  // çökmesindense çevrim yapılmadan devam edilir; bu durumda toplamlar
  // karma para birimi olur ve arayüzde uyarı gösterilir.
  const fxRates = await Promise.all([
    convert(1, "TRY", baseCurrency),
    convert(1, "USD", baseCurrency),
  ]).catch(() => null);

  const fxUnavailable = fxRates === null;
  const [tryToBase, usdToBase] = fxRates ?? [new Decimal(1), new Decimal(1)];

  function toBase(amount: Decimal | string, currency: string): Decimal {
    const rate = currency === "TRY" ? tryToBase : currency === "USD" ? usdToBase : new Decimal(1);
    return new Decimal(amount).mul(rate);
  }

  // Pozisyonlar her zaman işlem defterinden türetilir; ayrı bir toplam
  // tablosu tutulmadığı için ikisi birbirinden sapamaz.
  const allPositionsInput = transactions.map((t) => ({
    symbol: t.symbol,
    assetType: t.assetType,
    side: t.side,
    quantity: t.quantity.toString(),
    pricePerUnit: t.pricePerUnit.toString(),
    currency: t.currency,
    tradedAt: t.tradedAt,
    createdAt: t.createdAt,
  }));
  const allPositions = derivePositions(allPositionsInput);
  const positions = openPositions(allPositions);

  // Kapanan pozisyonların güncel fiyatı gerekmez (piyasa değeri yok);
  // yalnızca açık olanlar için fiyat çekilir.
  const priceEntries = await Promise.all(
    allPositions.map((p) =>
      p.quantity.greaterThan(0)
        ? getOrRefreshPriceWithStatus(p.symbol, p.assetType as never)
        : Promise.resolve({ snapshot: null, error: null })
    )
  );

  /*
   * 24 saatlik değişim için karşılaştırma fiyatı: fiyat arşivindeki
   * BUGÜNDEN ÖNCEKİ son kayıt. "Tam 24 saat önce" diye bir kayıt yok —
   * arşiv gün bazlı; borsalar da zaten gün kapanışıyla çalışıyor.
   *
   * Karşılaştırılacak gün yoksa değişim null kalıyor. "%0" yazmak fiyatın
   * değişmediğini söylerdi, oysa bilmiyoruz.
   */
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const previousCloses = await prisma.priceHistory.findMany({
    where: {
      date: { lt: new Date(`${todayKey}T00:00:00Z`) },
      OR: allPositions.map((p) => ({
        symbol: p.symbol,
        assetType: p.assetType as never,
      })),
    },
    orderBy: { date: "desc" },
  });
  const previousCloseFor = (symbol: string, assetType: string) =>
    previousCloses.find(
      (h) => h.symbol === symbol && h.assetType === assetType
    ) ?? null;

  const rows: HoldingRow[] = allPositions.map((p, i) => {
    const { snapshot: price, error } = priceEntries[i];
    const isOpen = p.quantity.greaterThan(0);
    const base = {
      key: `${p.symbol}|${p.assetType}|${p.currency}`,
      symbol: p.symbol,
      assetType: p.assetType,
      quantity: p.quantity.toString(),
      avgCostBasis: p.avgCostBasis.toString(),
      currency: p.currency,
      realizedPL: p.realizedPL.toFixed(2),
      isOpen,
    };

    if (!price) {
      return {
        ...base,
        currentPrice: null,
        priceCurrency: null,
        priceSource: null,
        marketValue: null,
        unrealizedPL: null,
        unrealizedPLPercent: null,
        marketValueBase: null,
        unrealizedPLBase: null,
        dayChangePercent: null,
        dayChangeAmount: null,
        error,
      };
    }

    const pl = computeHoldingPL(p.quantity, p.avgCostBasis, price.price);

    // Değişim yalnızca aynı para biriminde anlamlı; arşiv başka bir para
    // biriminde kaydedilmişse (sağlayıcı değişmiş olabilir) karşılaştırma
    // yapılmıyor.
    const previous = previousCloseFor(p.symbol, p.assetType);
    const previousPrice =
      previous && previous.currency === price.currency
        ? new Decimal(previous.price.toString())
        : null;
    const dayChangePercent =
      previousPrice && !previousPrice.isZero()
        ? price.price.minus(previousPrice).div(previousPrice).times(100)
        : null;
    const dayChangeAmount =
      previousPrice !== null
        ? price.price.minus(previousPrice).mul(p.quantity)
        : null;

    return {
      ...base,
      currentPrice: price.price.toString(),
      priceCurrency: price.currency,
      priceSource: price.source,
      marketValue: pl.marketValue.toFixed(2),
      unrealizedPL: pl.unrealizedPL.toFixed(2),
      unrealizedPLPercent: pl.unrealizedPLPercent?.toFixed(2) ?? "0",
      // Toplamlar ve dağılım için baz para birimi karşılıkları.
      marketValueBase: toBase(pl.marketValue, price.currency).toFixed(2),
      unrealizedPLBase: toBase(pl.unrealizedPL, price.currency).toFixed(2),
      dayChangePercent: dayChangePercent?.toFixed(2) ?? null,
      dayChangeAmount: dayChangeAmount?.toFixed(2) ?? null,
      error: null,
    };
  });

  const priced = rows.filter((r) => r.marketValueBase !== null);

  const totalMarketValue = priced.reduce(
    (sum, r) => sum.plus(new Decimal(r.marketValueBase as string)),
    new Decimal(0)
  );
  const totalPL = priced.reduce(
    (sum, r) => sum.plus(new Decimal(r.unrealizedPLBase as string)),
    new Decimal(0)
  );
  // Gerçekleşen kâr/zarar da pozisyonun kendi para biriminden çevrilir.
  const realizedTotalBase = allPositions.reduce(
    (sum, p) => sum.plus(toBase(p.realizedPL, p.currency)),
    new Decimal(0)
  );
  // Toplam sonuç: hem elde tutulanların kâğıt üstündeki kâr/zararı hem de
  // satışlardan gerçekleşmiş olanlar.
  const combinedPL = totalPL.plus(realizedTotalBase);
  // Maliyet = piyasa değeri − kâğıt üstündeki kâr/zarar. Ayrıca toplamak
  // yerine buradan türetiliyor ki fiyatı alınamayan pozisyonlar iki
  // taraftan da aynı anda düşsün; yoksa "maliyet" portföyde olmayan bir
  // varlığı da sayardı.
  const totalCost = totalMarketValue.minus(totalPL);

  const allocation = priced.map((r) => ({
    name: r.symbol,
    value: Number(r.marketValueBase),
  }));

  const manualSymbols = [
    ...new Set(
      positions.filter((p) => p.assetType === "MANUAL").map((p) => p.symbol)
    ),
  ];

  // ---- Aylık seyir grafiği ----
  // İlk işlemden bu yana her ay. Fiyatlar günlük arşivden okunur; bir ay için
  // arşiv yoksa o ayın piyasa değeri hesaplanmaz (bkz. computeMonthlySeries).
  const firstTradeDate = transactions.reduce<Date | null>(
    (earliest, t) => (!earliest || t.tradedAt < earliest ? t.tradedAt : earliest),
    null
  );

  const trendMonths: string[] = [];
  if (firstTradeDate) {
    const now = new Date();
    let cursor = new Date(
      Date.UTC(firstTradeDate.getUTCFullYear(), firstTradeDate.getUTCMonth(), 1)
    );
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // Grafiği makul tutmak için en fazla 36 ay.
    while (cursor <= last && trendMonths.length < 36) {
      trendMonths.push(format(cursor, "yyyy-MM"));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  }

  const priceHistory =
    trendMonths.length > 0
      ? await prisma.priceHistory.findMany({
          where: {
            OR: allPositions.map((p) => ({
              symbol: p.symbol,
              assetType: p.assetType as never,
            })),
          },
          orderBy: { date: "asc" },
        })
      : [];

  // Bir ay sonu için o tarihe kadarki EN SON fiyat kaydı geçerlidir.
  const priceAt: PriceLookup = (symbol, assetType, monthEnd) => {
    let best: (typeof priceHistory)[number] | null = null;
    for (const h of priceHistory) {
      if (h.symbol !== symbol || h.assetType !== assetType) continue;
      if (h.date > monthEnd) break;
      best = h;
    }
    return best
      ? { price: new Decimal(best.price.toString()), currency: best.currency }
      : null;
  };

  const trend = computeMonthlySeries({
    transactions: allPositionsInput,
    months: trendMonths,
    priceAt,
    toBase: (amount, currency) => toBase(amount, currency),
  });

  /*
   * Serbest nakit: çekilmeden bırakılan satış hasılatı. Portföy değerine
   * dahil DEĞİL (bir varlık değil, bekleyen para) ama kullanıcının yatırım
   * hesabındaki toplam varlığı bu ikisinin toplamı.
   */
  const freeCash = freeCashBalance({
    transactions: transactions.map((t) => ({
      symbol: t.symbol,
      assetType: t.assetType,
      side: t.side,
      quantity: new Decimal(t.quantity.toString()),
      pricePerUnit: new Decimal(t.pricePerUnit.toString()),
      currency: t.currency,
      tradedAt: t.tradedAt,
      createdAt: t.createdAt,
      isOpening: t.isOpening,
      proceedsWithdrawn: t.proceedsWithdrawn,
    })),
    toBase: (amount, currency) => toBase(amount, currency),
  });

  const logRows: TransactionRow[] = transactions.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    assetType: t.assetType,
    side: t.side,
    quantity: t.quantity.toString(),
    pricePerUnit: t.pricePerUnit.toString(),
    currency: t.currency,
    tradedAt: format(t.tradedAt, "yyyy-MM-dd"),
    note: t.note,
    isOpening: t.isOpening,
  }));

  const plTone = (v: Decimal) => (v.isNegative() ? "negative" : "default");
  const money = (v: Decimal) =>
    formatMoneyWhole(v.toNumber(), fxUnavailable ? undefined : baseCurrency);
  const signed = (v: Decimal) =>
    formatSignedWhole(v.toNumber(), fxUnavailable ? undefined : baseCurrency);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
            Yatırımlar
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Açık pozisyonlar, dağılım ve işlem defteri. Tutarlar{" "}
            {baseCurrency} karşılığıyla toplanır.
          </p>
        </div>
        <RefreshButton />
      </header>

      {fxUnavailable && transactions.length > 0 && (
        <div className="border-destructive bg-accent text-accent-foreground border px-4 py-3">
          <p className="text-[14px] font-extrabold">Kur bilgisi alınamadı</p>
          <p className="mt-1 text-[13px] leading-snug">
            Döviz kuru kaynağına şu an ulaşılamıyor ve önbellekte de kayıtlı
            bir kur yok. Aşağıdaki toplamlar para birimleri çevrilmeden
            toplandığı için <strong>karma</strong> ve yanıltıcı olabilir; tek
            tek pozisyon satırları doğrudur. Kur geldiğinde toplamlar
            kendiliğinden düzelir.
          </p>
        </div>
      )}

      {/* Pozisyonun tamamı satıldığında açık pozisyon kalmaz; şerit yine de
          görünmeli, yoksa gerçekleşen kâr/zarar hiçbir yerde okunamıyor. */}
      {transactions.length > 0 && (
        <StatStrip columns={5}>
          <Stat
            label="Portföy değeri"
            value={money(totalMarketValue)}
            caption="güncel fiyatlarla"
            info={
              <CalcInfo title="Portföy Değeri nasıl hesaplanır">
                <p>
                  Yalnızca <strong>açık</strong> pozisyonlar için: adet ×
                  güncel fiyat. Tamamen satılmış pozisyonlar elde bir şey
                  kalmadığı için buraya girmez.
                </p>
                <p>
                  Her pozisyon kendi fiyat para biriminden baz para birimine (
                  {baseCurrency}) çevrilip toplanır. Kur, güncel piyasa
                  kurudur (1 saat cache&apos;lenir).
                </p>
              </CalcInfo>
            }
          />
          <Stat
            label="Maliyet"
            value={money(totalCost)}
            caption="ağırlıklı ortalama"
            info={
              <CalcInfo title="Maliyet nasıl bulunur">
                <p>
                  Açık pozisyonların ağırlıklı ortalama maliyeti × adet.
                  Piyasa değerinden kâğıt üstündeki kâr/zarar düşülerek
                  türetilir; böylece fiyatı alınamayan bir pozisyon iki
                  taraftan da aynı anda düşer.
                </p>
              </CalcInfo>
            }
          />
          <Stat
            label="Açık pozisyon K/Z"
            value={signed(totalPL)}
            tone={plTone(totalPL)}
            caption={
              totalCost.isZero()
                ? "maliyet kaydı yok"
                : `maliyete göre %${totalPL.div(totalCost).times(100).toFixed(1)}`
            }
            info={
              <CalcInfo title="Kâr/Zarar nasıl hesaplanır">
                <p>
                  Her açık pozisyon için: (adet × güncel fiyat) − (adet ×
                  ağırlıklı ortalama maliyet). Henüz satılmamış, yani
                  &quot;kâğıt üstündeki&quot; kâr/zarardır.
                </p>
                <p>Baz para birimine ({baseCurrency}) çevrilerek toplanır.</p>
              </CalcInfo>
            }
          />
          <Stat
            label="Serbest nakit"
            value={money(freeCash)}
            caption={
              freeCash.isZero()
                ? "bekleyen satış hasılatı yok"
                : "çekilmedi, sonraki alımları fonlar"
            }
            info={
              <CalcInfo title="Serbest nakit nedir">
                <p>
                  Sattığın ama <strong>hesabına çekmediğin</strong> tutarların
                  toplamı. Satış eklerken &quot;Parayı hesabıma çektim&quot;
                  kutusunu işaretlemezsen para buraya yazılır.
                </p>
                <p>
                  Nakit akışına <strong>gelir olarak girmez</strong> — cebe
                  girmemiştir. Sonraki alımların önce buradan karşılanır;
                  ancak serbest nakti aşan kısım Genel Bakış&apos;ta gider
                  olarak görünür.
                </p>
                <p>
                  Portföy değerine de dahil değildir: bir varlık değil,
                  bekleyen paradır.
                </p>
              </CalcInfo>
            }
          />
          <Stat
            label="Gerçekleşen K/Z"
            value={signed(realizedTotalBase)}
            tone={plTone(realizedTotalBase)}
            // Toplam K/Z kendi kutusunu hak etmiyordu: gerçekleşen ile açık
            // pozisyonun toplamı, ikisi de yanında dururken. Buraya alt
            // satır olarak indi, sayı kaybolmadı.
            caption={<>açıkla birlikte toplam {signed(combinedPL)}</>}
            info={
              <CalcInfo title="Gerçekleşen Kâr/Zarar nasıl hesaplanır">
                <p>
                  Her satış işleminde: (satış fiyatı − o andaki ağırlıklı
                  ortalama maliyet) × satılan adet. Tüm satışlar boyunca
                  biriktirilir.
                </p>
                <p>
                  Satış, ortalama maliyeti değiştirmez; sadece elde kalan
                  adeti azaltır. Baz para birimine ({baseCurrency}) çevrilerek
                  toplanır.
                </p>
              </CalcInfo>
            }
          />
        </StatStrip>
      )}

      {/*
        Teslimattaki düzen: solda pozisyon tablosu ve ALTINDA ayrı kartta
        dağılım pastası, sağda 340px'lik detay sütunu. Pasta önce tablonun
        YANINDAYDI; tablo dokuz sütunlu ve yarım genişlikte yatay kaydırmaya
        düşüyordu.
      */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="border-border border">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                Açık pozisyonlar
              </h2>
              <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                Adet ve ortalama maliyet işlem defterinden otomatik hesaplanır:
                alışlar ağırlıklı ortalamaya katılır, satışlar adetten düşülür
                ve gerçekleşen kâr/zarara yazılır. Tamamen satılmış
                pozisyonlar &quot;Kapanan&quot; filtresinde durur. Fiyatlar
                CoinGecko ve Yahoo Finance üzerinden çekilir, 5 dakika
                önbelleklenir.
              </p>
            </header>
            <HoldingsTable holdings={rows} />
          </section>


          <section className="border-border border">
            <header className="border-border border-b-2 px-4 py-3">
              <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                İşlem defteri
              </h2>
              <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                Her alış ve satış ayrı bir kayıttır. Yanlış girdiğin bir işlemi
                &quot;Düzenle&quot; ile yerinde düzeltebilirsin; üstteki
                ortalama maliyet ve kâr/zarar hesapları buna göre yeniden
                hesaplanır. Adet alanı kesirli değer kabul eder.
              </p>
            </header>
            <div className="space-y-4 p-4">
              <TransactionForm />
              <TransactionLog transactions={logRows} />
            </div>
          </section>
          {manualSymbols.length > 0 && (
            <section className="border-border border">
              <header className="border-border border-b-2 px-4 py-3">
                <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                  Manuel fiyatlar
                </h2>
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                  Otomatik çekilemeyen semboller için fiyatı elle gir.
                </p>
              </header>
              <div className="space-y-4 p-4">
                {manualSymbols.map((symbol) => (
                  <ManualPriceForm key={symbol} symbol={symbol} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {trend.length >= 2 && (
            <section className="border-border border">
              <header className="border-border border-b-2 px-4 py-3">
                <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                  Portföy detayı
                </h2>
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                  Ay sonlarındaki durum ({baseCurrency}).
                </p>
              </header>
              <div className="p-3">
                <PortfolioTrendChart data={trend} currency={baseCurrency} />
              </div>
            </section>
          )}

          {allocation.length > 0 && (
            <section className="border-border border">
              <header className="border-border border-b-2 px-4 py-3">
                <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
                  Dağılım
                </h2>
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
                  Açık pozisyonların güncel piyasa değerine göre ağırlıkları.
                </p>
              </header>
              <div className="p-4">
                <CategoryPieChart
                  slices={allocation}
                  currency={fxUnavailable ? "" : baseCurrency}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

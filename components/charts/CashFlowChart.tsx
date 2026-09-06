"use client";

import {
  Bar,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { formatCompactNumber, formatMonth, formatNumber } from "@/lib/format";

export type CashFlowPoint = {
  month: string;
  salary: number;
  otherIncome: number;
  /** Nakit/havale giderleri. */
  otherExpenses: number;
  /** O ay ödenen kredi kartı ekstresi. */
  creditCard: number;
  /** O ay ödenen kredi taksitleri. */
  loanPayments: number;
  /**
   * Yatırıma NET aktarılan para (cepten çıkan). Aynı ayki alım ve satımlar
   * netleştirilir; ikisinden yalnızca biri sıfırdan farklı olur.
   */
  investmentOut: number;
  /** Yatırımdan NET çekilen para (cebe giren). */
  investmentIn: number;
  /** Balonda gösterilen brüt döküm — netin nereden geldiğini açıklar. */
  investmentGross: { bought: number; sold: number; realizedPL: number };
  /**
   * `loanPayments` toplamını oluşturan krediler. Tek bir "Kredi Taksiti"
   * çubuğunda birden fazla kredi toplandığı için, hangi kredilerden geldiği
   * ancak burada görünür.
   */
  loanBreakdown: { name: string; amount: number }[];
  /** Üç gider kaleminin toplamı. */
  expenses: number;
  /** Gelir kalemlerinin toplamı. */
  income: number;
  /*
   * Yığın toplamı etiketinin taşıyıcıları. Toplam yalnızca yığının en
   * üstteki sıfır olmayan diliminde dolu; bkz. lib/dashboard/stackTotals.
   */
  totalAtSalary: number;
  totalAtOtherIncome: number;
  totalAtInvestmentIn: number;
  totalAtOtherExpenses: number;
  totalAtCreditCard: number;
  totalAtLoans: number;
  totalAtInvestmentOut: number;
  net: number;
  /** Bu ay henüz gelmediyse true — tekrarlayan kayıtlara dayalı projeksiyon. */
  projected?: boolean;
  /** İçinde bulunulan ay. Grafikte vurgulanır. */
  isCurrent?: boolean;
};

/** Grafikte hangi serilerin gösterileceği. */
export type CashFlowView = "all" | "income" | "expenses";

/*
 * Renkler anlamsal olarak iki AİLEYE ayrılır: gelir soğuk tonlar (mavi,
 * turkuaz), gider sıcak tonlar (kehribar, turuncu, gül). Genel kategorik
 * palet burada okunmuyordu — gelir ile gider birbirine yakın iki mavi
 * tonuna düşebiliyor, hangisinin ne olduğu ancak açıklamadan anlaşılıyordu.
 * Aile ayrımı sayesinde çubuğun hangi tarafa ait olduğu tek bakışta belli.
 *
 * Değerler app/globals.css'te --cash-income-* / --cash-expense-* olarak
 * tanımlı ve validate_palette.js ile açık/koyu temada doğrulandı. Ayrıca her
 * dilime değeri doğrudan yazıldığı için renk tek ayırt edici kanal değil.
 */

/**
 * Recharts'ın etiket içeriğine geçirdiği alanlar. Parametre `unknown`
 * alınıp burada daraltılıyor: kütüphanenin `Props` tipi dışa aktarılmıyor
 * ve daha dar bir parametre tipi yazmak atamayı bozuyor.
 */
type LabelRenderProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
};

function readGeometry(props: unknown) {
  const p = props as LabelRenderProps;
  return {
    x: Number(p.x),
    y: Number(p.y),
    width: Number(p.width),
    value: Number(p.value),
  };
}

/**
 * Yığının tepesine toplamı yazar. Hangi dilime bağlanacağı veride
 * hesaplanır (bkz. lib/dashboard/stackTotals): Recharts sıfır değerli dilim
 * için dikdörtgen çizmediğinden etiketi sabit olarak en üst seriye bağlamak
 * mümkün değil, etiket içeriğine de veri satırı geçmiyor.
 *
 * Gelir ve gider sütunları bitişik olduğundan altı haneli iki toplam yan
 * yana geldiğinde harfler birbirine giriyordu. Yazı kalın değildir ve
 * boyutu sütun genişliğine göre küçülür; böylece toplamlar tek satırda ve
 * tam sayı olarak kalır. Sütun genişliği grafik boyunca eşit olduğundan
 * hesaplanan boyut da her etikette aynıdır — yazılar birbirinden farklı
 * büyüklükte görünmez.
 */
function makeStackTotalLabel(tone: "income" | "expense") {
  function StackTotalLabel(props: unknown) {
    const { x, y, width, value } = readGeometry(props);
    // Taşıyıcı alan yalnızca yığının en üstteki dolu diliminde sıfırdan
    // farklı; böylece her yığında tek bir toplam çizilir.
    if (!value) return null;

    // Tam sayı ("106.530") bitişik iki sütunun etiketini birbirine
    // sokuyordu; kısaltma yazıyı küçültmeden sığdırmanın tek yolu.
    const text = formatCompactNumber(value);

    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fontSize={fitFontSize(text, width)}
        fontWeight={600}
        style={{
          // Gider etiketi vurgu kırmızısıyla değil metin-güvenli koyu
          // kırmızıyla yazılır: #ec3013 beyaz üstünde küçük puntoda
          // kontrast eşiğini geçmiyor.
          fill:
            tone === "expense"
              ? "var(--chart-expense-text)"
              : "var(--foreground)",
        }}
      >
        {text}
      </text>
    );
  }
  StackTotalLabel.displayName = `StackTotalLabel(${tone})`;
  return StackTotalLabel;
}

const IncomeTotalLabel = makeStackTotalLabel("income");
const ExpenseTotalLabel = makeStackTotalLabel("expense");

const LABEL_FONT_MAX = 11;
const LABEL_FONT_MIN = 8;

/**
 * Metnin yaklaşık genişliği. SVG'de çizmeden ölçmek mümkün olmadığından
 * karakter başına oran kullanılır: rakamlar geniş, binlik ayracı dar.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) units += ch === "." || ch === "," ? 0.3 : 0.56;
  return units * fontSize;
}

/**
 * Etiketi komşu sütunun etiketine değmeyecek en büyük boyuta ayarlar.
 *
 * Ortalanmış iki etiket, genişlikleri toplamının yarısı merkez aralığından
 * küçükse çakışmaz. Gelir ve gider sütunları bitişik olduğu için merkez
 * aralığı ≈ sütun genişliği + aradaki boşluk; eşit genişlikte iki etikette
 * sınır doğrudan sütun genişliğine iner.
 */
function fitFontSize(text: string, barWidth: number): number {
  const available = barWidth - 2; // birkaç piksel nefes payı
  const needed = estimateTextWidth(text, LABEL_FONT_MAX);
  if (needed <= available) return LABEL_FONT_MAX;
  const scaled = (LABEL_FONT_MAX * available) / needed;
  return Math.max(LABEL_FONT_MIN, Math.round(scaled * 10) / 10);
}

/**
 * Projeksiyon aylarının çubuğu içi boş, 2px çerçeveli çizilir.
 *
 * Önce tarama deseni (hatch) denendi ve incelemede reddedildi: yığılmış
 * dilimlerde desen dilim sınırlarını yutuyor, çubuk tek parça görünüyordu.
 * Boş çerçeve hem dilim sınırını koruyor hem "bu ay henüz olmadı"yı tek
 * bakışta söylüyor.
 *
 * Renk tek ayırt edici kanal değil: gösterge ayrıca "Projeksiyon" örneğini
 * taşıyor ve balonda ayın adının yanında yazıyor.
 */
function BarShape(props: unknown) {
  const p = props as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fill?: string;
    payload?: CashFlowPoint;
  };
  const x = Number(p.x);
  const y = Number(p.y);
  const width = Number(p.width);
  const height = Number(p.height);
  if (!Number.isFinite(height) || height <= 0) return null;

  if (!p.payload?.projected) {
    return <rect x={x} y={y} width={width} height={height} fill={p.fill} />;
  }

  // Çerçeve çizginin ORTASINDAN çizildiği için dikdörtgen yarım kalınlık
  // içeri alınıyor; aksi halde komşu sütunun alanına taşıyor ve bitişik
  // gelir/gider çubukları birbirine değiyordu.
  const inset = 1;
  return (
    <rect
      x={x + inset}
      y={y + inset}
      width={Math.max(width - inset * 2, 0)}
      height={Math.max(height - inset * 2, 0)}
      fill="none"
      stroke={p.fill}
      strokeWidth={2}
    />
  );
}

/** Tooltip'te gösterilecek kalemler; sıra bilerek sabit. */
const TOOLTIP_ROWS = [
  { key: "salary", label: "Maaş", color: "var(--cash-income-1)", group: "income" },
  { key: "otherIncome", label: "Diğer Gelir", color: "var(--cash-income-2)", group: "income" },
  { key: "investmentIn", label: "Yatırımdan Çekilen", color: "var(--cash-invest)", group: "income" },
  { key: "otherExpenses", label: "Genel Gider", color: "var(--cash-expense-1)", group: "expense" },
  { key: "creditCard", label: "Kredi Kartı", color: "var(--cash-expense-2)", group: "expense" },
  { key: "loanPayments", label: "Kredi Taksiti", color: "var(--cash-expense-3)", group: "expense" },
  { key: "investmentOut", label: "Yatırıma Aktarılan", color: "var(--cash-invest)", group: "expense" },
] as const;

/**
 * Bir ayın kırılımı — yalnızca imleç sütunun üzerindeyken.
 *
 * Çubukların üzerinde sadece TOPLAMLAR duruyor; her dilime ayrıca değer
 * yazmak grafiği okunmaz hale getiriyordu. Kalem kalem dökümü isteyen
 * sütunun üzerine geliyor.
 *
 * Recharts'ın varsayılan tooltip'i serileri kendi sırasına göre ve sıfır
 * olanları da dahil ederek listeliyordu; burada sıra sabit, sıfır kalemler
 * gizli ve gelir/gider ayrı ayrı toplanıyor.
 */
function CashFlowTooltip({
  active,
  payload,
  label,
  baseCurrency,
  view,
  currentMonth,
}: {
  active?: boolean;
  payload?: readonly { payload?: CashFlowPoint }[];
  label?: unknown;
  baseCurrency: string;
  view: CashFlowView;
  currentMonth?: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const money = (value: number) => `${formatNumber(value)} ${baseCurrency}`;
  const showIncome = view === "all" || view === "income";
  const showExpenses = view === "all" || view === "expenses";

  const groupRows = (group: "income" | "expense") =>
    TOOLTIP_ROWS.filter((r) => r.group === group && row[r.key] !== 0);

  const incomeRows = showIncome ? groupRows("income") : [];
  const expenseRows = showExpenses ? groupRows("expense") : [];

  return (
    <div className="bg-popover text-popover-foreground border-border border-2 p-3 text-xs">
      <p className="mb-2 font-medium">
        {formatMonth(String(label))}
        {String(label) === currentMonth && (
          <span className="text-muted-foreground font-normal"> (bu ay)</span>
        )}
        {row.projected && (
          <span className="text-muted-foreground font-normal"> (projeksiyon)</span>
        )}
      </p>

      {incomeRows.length > 0 && (
        <Section
          title="Gelir"
          rows={incomeRows}
          data={row}
          total={row.income}
          money={money}
        />
      )}
      {expenseRows.length > 0 && (
        <Section
          title="Gider"
          rows={expenseRows}
          data={row}
          total={row.expenses}
          money={money}
        />
      )}

      {incomeRows.length === 0 && expenseRows.length === 0 && (
        <p className="text-muted-foreground">Bu ayda kayıt yok.</p>
      )}

      {view === "all" && (
        <div className="mt-2 flex items-center justify-between gap-6 border-t pt-2 font-medium">
          <span>Net</span>
          <span className={row.net < 0 ? "text-destructive" : ""}>
            {money(row.net)}
          </span>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  data,
  total,
  money,
}: {
  title: string;
  rows: readonly (typeof TOOLTIP_ROWS)[number][];
  data: CashFlowPoint;
  total: number;
  money: (value: number) => string;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-muted-foreground mb-1">{title}</p>
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                style={{ background: r.color }}
                className="inline-block size-2.5"
              />
              {r.label}
            </span>
            <span>{money(data[r.key])}</span>
          </div>
          {/* Kredi taksiti tek çubukta toplandığı için hangi kredilerden
              geldiği alt satırlarda açılır. Tek kredi varsa alt satır aynı
              sayıyı tekrar edeceğinden gösterilmez. */}
          {r.key === "loanPayments" &&
            data.loanBreakdown.length > 1 &&
            data.loanBreakdown.map((loan) => (
              <div
                key={loan.name}
                className="text-muted-foreground flex items-center justify-between gap-6 pl-4"
              >
                <span>{loan.name}</span>
                <span>{money(loan.amount)}</span>
              </div>
            ))}
          {/* Yatırım tek NET rakamla gösteriliyor; o netin hangi alım ve
              satımlardan çıktığı ancak burada görünür. Kâr/zarar bilgi
              amaçlıdır — hasılatın içinde zaten sayıldığı için toplama
              ayrıca eklenmez. */}
          {(r.key === "investmentOut" || r.key === "investmentIn") && (
            <InvestmentDetail gross={data.investmentGross} money={money} />
          )}
        </div>
      ))}
      {/* Tek kalem varsa toplam satırı aynı sayıyı tekrar ederdi. */}
      {rows.length > 1 && (
        <div className="mt-1 flex items-center justify-between gap-6 border-t pt-1 font-medium">
          <span>Toplam</span>
          <span>{money(total)}</span>
        </div>
      )}
    </div>
  );
}

function InvestmentDetail({
  gross,
  money,
}: {
  gross: CashFlowPoint["investmentGross"];
  money: (value: number) => string;
}) {
  const rows: [string, string][] = [];
  if (gross.bought > 0) rows.push(["Alım", money(gross.bought)]);
  if (gross.sold > 0) rows.push(["Satış", money(gross.sold)]);
  if (gross.realizedPL !== 0) {
    rows.push([
      gross.realizedPL > 0 ? "Realize kâr" : "Realize zarar",
      money(Math.abs(gross.realizedPL)),
    ]);
  }
  if (rows.length === 0) return null;

  return (
    <>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="text-muted-foreground flex items-center justify-between gap-6 pl-4"
        >
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </>
  );
}

type LegendItem = {
  label: string;
  color: string;
  /** Aynı gruptaki kalemler yan yana, grup adı bir kez yazılır. */
  group: string;
  line?: boolean;
  /** İçi boş çerçeve — projeksiyon çubuklarının karşılığı. */
  outline?: boolean;
};

/**
 * Gruplanmış gösterge. Recharts'ın varsayılan göstergesi serileri kendi
 * sırasına göre diziyor ve gelir/gider kalemleri birbirine karışıyordu
 * ("Diğer Gelir → giderler → Maaş"). Burada sıra ve gruplama sabit.
 */
function GroupedLegend({ items }: { items: LegendItem[] }) {
  const groups: { name: string; items: LegendItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-2 text-xs">
      {groups.map((group) => (
        <div key={group.name} className="flex flex-wrap items-center gap-x-3">
          {group.name && (
            <span className="text-muted-foreground font-medium">
              {group.name}:
            </span>
          )}
          {group.items.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                style={
                  item.outline
                    ? { border: `2px solid ${item.color}` }
                    : { background: item.color }
                }
                className={
                  item.line ? "inline-block h-0.5 w-4" : "inline-block size-3"
                }
              />
              {item.label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Ay etiketi ve ALTINDA o ayın net değişimi.
 *
 * Net, grafikte çizgi olarak da var ama çizgi yalnızca şekli gösteriyor;
 * "ağustosta ne kadar açık verdim" sorusu ancak balonu açarak
 * yanıtlanıyordu. Sayıyı eksene yazmak onu her zaman görünür kılıyor ve
 * hizalama bedavaya geliyor: etiket zaten sütunun merkezinde.
 *
 * İçinde bulunulan ay kalın yazılır ve etiketin arkasındaki rozetle
 * ayrılır; sütunun kendisini boyamak yığın renklerini bozardı.
 */
function MonthTick({
  x,
  y,
  payload,
  currentMonth,
  short,
  netByMonth,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  currentMonth?: string;
  /** Telefonda yalnızca ay adı ("Mar"), masaüstünde yılla ("Mar 2026"). */
  short?: boolean;
  /** yyyy-MM -> o ayın neti. Yoksa alt satır çizilmez. */
  netByMonth?: ReadonlyMap<string, number>;
}) {
  const value = payload?.value ?? "";
  const isCurrent = value === currentMonth;
  const cx = x ?? 0;
  const cy = (y ?? 0) + 14;
  // Telefonda tam etiket yan yana sığmıyor, harfler birbirine giriyordu;
  // yıl zaten grafiğin başlığında yazdığı için yalnızca ay adı gösterilir.
  const full = formatMonth(value);
  const text = short ? full.split(" ")[0] : full;

  const net = netByMonth?.get(value);

  return (
    <g>
      {isCurrent && (
        <rect
          x={cx - (short ? 18 : 32)}
          y={cy - 11}
          width={short ? 36 : 64}
          height={18}
          style={{ fill: "var(--muted-foreground)" }}
          fillOpacity={0.18}
        />
      )}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        fontSize={12}
        fontWeight={isCurrent ? 700 : 400}
        style={{
          fill: isCurrent ? "var(--foreground)" : "var(--muted-foreground)",
        }}
      >
        {text}
      </text>
      {net !== undefined && (
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          style={{
            fill:
              net < 0 ? "var(--chart-expense-text)" : "var(--foreground)",
          }}
        >
          {net > 0 ? `+${formatCompactNumber(net)}` : formatCompactNumber(net)}
        </text>
      )}
    </g>
  );
}

export function CashFlowChart({
  data,
  baseCurrency,
  view = "all",
  onSelectMonth,
  selectedMonth,
  currentMonth,
}: {
  data: CashFlowPoint[];
  baseCurrency: string;
  view?: CashFlowView;
  onSelectMonth?: (month: string) => void;
  selectedMonth?: string;
  /** yyyy-MM — grafikte vurgulanacak ay. */
  currentMonth?: string;
}) {
  const isMobile = useIsMobile();
  const showIncome = view === "all" || view === "income";
  const showExpenses = view === "all" || view === "expenses";
  // Net yalnızca ikisi bir aradayken anlamlı; tek taraf filtrelendiğinde
  // gizlenir ki okur onu o serinin toplamı sanmasın.
  const showNet = view === "all";
  // Hiç yatırım hareketi yoksa açıklamayı gereksiz yere kalabalıklaştırmasın.
  const hasInvestment = data.some(
    (point) => point.investmentOut > 0 || point.investmentIn > 0
  );
  const hasProjection = data.some((point) => point.projected);
  // Net eksenin altına yazılır; tek taraf filtrelenmişken net anlamsız
  // (o tarafın toplamı sanılırdı), o yüzden yalnızca "Tümü" görünümünde.
  const netByMonth = showNet
    ? new Map(data.map((point) => [point.month, point.net]))
    : undefined;

  const legendPayload: LegendItem[] = [
    ...(showIncome
      ? [
          { label: "Maaş", color: "var(--cash-income-1)", group: "Gelir" },
          { label: "Diğer Gelir", color: "var(--cash-income-2)", group: "Gelir" },
        ]
      : []),
    ...(showExpenses
      ? [
          { label: "Genel Gider", color: "var(--cash-expense-1)", group: "Gider" },
          { label: "Kredi Kartı", color: "var(--cash-expense-2)", group: "Gider" },
          { label: "Kredi Taksiti", color: "var(--cash-expense-3)", group: "Gider" },
        ]
      : []),
    // Yatırım kendi grubunda: ne gelir ne gider, varlıklar arası aktarım.
    // Yönüne göre gelir ya da gider yığınına oturur ama açıklamada tek satır.
    ...(hasInvestment
      ? [{ label: "Alım/Satım (net)", color: "var(--cash-invest)", group: "Yatırım" }]
      : []),
    ...(showNet
      ? [{ label: "Net", color: "var(--foreground)", group: "", line: true }]
      : []),
    // Renk tek ayırt edici kanal olmasın: içi boş çubuğun ne demek olduğu
    // göstergede yazıyor, ayrıca balonda da "(projeksiyon)" geçiyor.
    ...(hasProjection
      ? [
          {
            label: "Projeksiyon",
            color: "var(--foreground)",
            group: "",
            outline: true,
          },
        ]
      : []),
  ];

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart
        data={data}
        margin={{ top: 24, right: 8, left: 8, bottom: 0 }}
        onClick={(state) => {
          const month = state?.activeLabel;
          if (typeof month === "string") onSelectMonth?.(month);
        }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="month"
          tick={
            <MonthTick
              currentMonth={currentMonth}
              short={isMobile}
              netByMonth={netByMonth}
            />
          }
          // Uzun aralıklarda her ayı yazdırmak etiketleri üst üste bindiriyor
          // (12 ayda 768px'te ve telefonda ölçtük). Yoğunlukta Recharts
          // sığmayanları atlar; kısa aralıklarda hepsi görünsün diye 0.
          interval={data.length > 8 ? "preserveStartEnd" : 0}
          height={netByMonth ? 46 : 28}
        />
        {/* Eksen de çubuk etiketleriyle aynı kısaltmayı kullanır; "75000"
            ile "46,6B" yan yana durunca aynı büyüklüğün iki farklı yazımı
            gibi okunuyordu. */}
        <YAxis
          tick={{ fontSize: 11 }}
          width={52}
          tickFormatter={(value: number) => formatCompactNumber(value)}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <CashFlowTooltip
              baseCurrency={baseCurrency}
              view={view}
              currentMonth={currentMonth}
            />
          }
        />
        {/* Gösterge sırası bilerek sabitlendi: önce gelir kalemleri, sonra
            gider kalemleri, en sonda Net. Recharts'ın kendi sırası aileleri
            karıştırıyordu (Diğer Gelir → giderler → Maaş) ve grafiğin hangi
            renginin hangi tarafa ait olduğu okunmuyordu. */}
        <Legend content={<GroupedLegend items={legendPayload} />} />

        {showIncome && (
          <Bar
            dataKey="salary"
            name="Maaş"
            stackId="income"
            fill="var(--cash-income-1)"
            cursor="pointer"
            shape={BarShape}
          >
            <LabelList dataKey="totalAtSalary" content={IncomeTotalLabel} />
          </Bar>
        )}
        {showIncome && (
          <Bar
            dataKey="otherIncome"
            name="Diğer Gelir"
            stackId="income"
            fill="var(--cash-income-2)"
            cursor="pointer"
            shape={BarShape}
          >
            <LabelList dataKey="totalAtOtherIncome" content={IncomeTotalLabel} />
          </Bar>
        )}
        {showIncome && (
          <Bar
            dataKey="investmentIn"
            name="Yatırımdan Çekilen"
            stackId="income"
            fill="var(--cash-invest)"
            cursor="pointer"
            shape={BarShape}
          >
            <LabelList
              dataKey="totalAtInvestmentIn"
              content={IncomeTotalLabel}
            />
          </Bar>
        )}

        {showExpenses && (
          <Bar
            dataKey="otherExpenses"
            name="Genel Gider"
            stackId="expenses"
            fill="var(--cash-expense-1)"
            cursor="pointer"
            shape={BarShape}
          >
            <LabelList
              dataKey="totalAtOtherExpenses"
              content={ExpenseTotalLabel}
            />
          </Bar>
        )}
        {showExpenses && (
          <Bar
            dataKey="creditCard"
            name="Kredi Kartı"
            stackId="expenses"
            fill="var(--cash-expense-2)"
            cursor="pointer"
            shape={BarShape}
          >
            <LabelList
              dataKey="totalAtCreditCard"
              content={ExpenseTotalLabel}
            />
          </Bar>
        )}
        {showExpenses && (
          <Bar
            dataKey="loanPayments"
            name="Kredi Taksiti"
            stackId="expenses"
            fill="var(--cash-expense-3)"
            cursor="pointer"
            shape={BarShape}
          >
            <LabelList
              dataKey="totalAtLoans"
              content={ExpenseTotalLabel}
            />
          </Bar>
        )}
        {showExpenses && (
          <Bar
            dataKey="investmentOut"
            name="Yatırıma Aktarılan"
            stackId="expenses"
            fill="var(--cash-invest)"
            cursor="pointer"
            shape={BarShape}
          >
            <LabelList
              dataKey="totalAtInvestmentOut"
              content={ExpenseTotalLabel}
            />
          </Bar>
        )}

        {showNet && (
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={(props) => {
              const isSelected = props.payload.month === selectedMonth;
              return (
                <circle
                  key={props.payload.month}
                  cx={props.cx}
                  cy={props.cy}
                  r={isSelected ? 5 : 4}
                  fill="var(--foreground)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              );
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

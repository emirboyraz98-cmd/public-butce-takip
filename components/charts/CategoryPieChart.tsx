"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { formatMoney } from "@/lib/format";
import { colorForIndex, foldToTopN, type Slice } from "@/lib/charts/palette";

/**
 * Bir bütünün parçalarını (kategori dağılımı, portföy ağırlıkları) gösteren
 * halka grafik. Dilim sayısı palet kapasitesini aşarsa fazlası "Diğer"de
 * toplanır — renk üretilmez. Kimlik yalnızca renge bırakılmaz: her dilim
 * ayrıca legend'da ve tooltip'te adıyla yazılır, %5 üstü dilimler doğrudan
 * etiketlenir.
 */
/**
 * Dilim balonu. Recharts'ın hazır balonu seri adını "Tutar" gibi sabit bir
 * etiketle gösteriyordu; küçük dilimlerin üstünde etiket olmadığı için
 * hangi kaleme baktığın anlaşılmıyordu. Burada kalem adı başlıkta yazar.
 */
function SliceTooltip({
  active,
  payload,
  currency,
  share,
  colorOf,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number }[];
  currency: string;
  share: (value: number) => number;
  colorOf: (name: string) => string;
}) {
  const item = payload?.[0];
  if (!active || !item) return null;

  const name = item.name ?? "";
  const value = Number(item.value ?? 0);

  return (
    <div className="bg-popover text-popover-foreground border px-2.5 py-1.5 text-xs shadow-sm">
      <div className="flex items-center gap-1.5 font-medium">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: colorOf(name) }}
        />
        {name}
      </div>
      <div className="text-muted-foreground mt-0.5">
        {formatMoney(value, currency)} · %{share(value).toFixed(1)}
      </div>
    </div>
  );
}

export function CategoryPieChart({
  slices,
  currency,
  height = 280,
  emptyMessage = "Gösterilecek kayıt yok.",
}: {
  slices: Slice[];
  currency: string;
  height?: number;
  emptyMessage?: string;
}) {
  const isMobile = useIsMobile();
  const data = foldToTopN(slices);
  const total = data.reduce((sum, s) => sum + s.value, 0);

  if (data.length === 0 || total <= 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  const share = (value: number) => (value / total) * 100;

  return (
    // Donut'un yarıçapı sabit; kap genişledikçe halka büyümüyor, yalnızca
    // iki yanında boşluk açılıyordu (1552px'lik kartta 1538px'i grafiğin
    // dışındaydı). Genişlik sınırlanıp yanına değer listesi konuyor: aynı
    // alan artık tutarları da gösteriyor.
    // @container'ı ilan eden eleman kendi kendini sorgulayamaz; bağlam
    // ALT elemanlara kurulur. Bu yüzden kap ayrı bir sarmalayıcı.
    <div className="@container/pie">
      <div className="flex flex-col gap-4 @2xl/pie:flex-row @2xl/pie:items-center @2xl/pie:gap-8">
        <div className="w-full @2xl/pie:max-w-[26rem] @2xl/pie:[&_.recharts-legend-wrapper]:hidden">
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={isMobile ? "50%" : "45%"}
          outerRadius={isMobile ? "88%" : "75%"}
          // Dilimler arasında zemin renginde 2px'lik ayraç: bitişik renkler
          // birbirine akmasın diye.
          stroke="var(--card)"
          strokeWidth={2}
          paddingAngle={1}
          // Küçük dilimlerde etiketler üst üste bineceği için yalnızca
          // %5'ten büyük olanlar doğrudan etiketlenir; kalanlar legend'dan
          // ve tooltip'ten okunur.
          //
          // Telefonda etiket hiç yazılmaz: "Kredi: Konut Kredisi" gibi uzun
          // adlar 390px'lik ekranda kartın dışına taşıyordu (ölçüldü, 71px).
          // Kimlik zaten legend'da ve dokununca balonda duruyor.
          label={
            isMobile
              ? false
              : ({ name, value }) =>
                  share(Number(value)) >= 5
                    ? `${name} %${share(Number(value)).toFixed(0)}`
                    : ""
          }
          labelLine={false}
          isAnimationActive={false}
        >
          {data.map((slice, index) => (
            <Cell key={slice.name} fill={colorForIndex(index)} />
          ))}
        </Pie>
        <Tooltip
          content={
            <SliceTooltip
              currency={currency}
              share={share}
              colorOf={(name) =>
                colorForIndex(data.findIndex((s) => s.name === name))
              }
            />
          }
        />
        {/* Dar kapta efsane altta kalır; geniş kapta yerini yandaki
            değer listesi alır, aynı bilgiyi tutarlarla birlikte verir. */}
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => (
            <span className="text-foreground text-xs">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
        </div>

        <ul className="hidden min-w-0 flex-1 flex-col gap-1.5 text-sm @2xl/pie:flex @2xl/pie:max-w-md">
        {data.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: colorForIndex(index) }}
            />
            <span className="truncate">{slice.name}</span>
            <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
              %{share(slice.value).toFixed(0)}
            </span>
            <span className="w-32 shrink-0 text-right font-medium tabular-nums">
              {formatMoney(slice.value, currency)}
            </span>
          </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

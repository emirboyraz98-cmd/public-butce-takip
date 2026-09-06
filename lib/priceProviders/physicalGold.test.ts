import { describe, expect, it } from "vitest";

import { parseHasAltinHtml } from "./physicalGold";

// hasaltin.com'un gerçek sayfasından alınmış bir kesit (kullanıcı tarafından
// paylaşıldı) — site JSON API sunmuyor, fiyatlar HTML'e gömülü.
const SAMPLE_HTML = `
<h1 class="mb15">Altın Fiyatları</h1>
<ul class="datalist">
  <li>
    <div class="box">
      <div class="kur">
        <div class="name">Has Altın / TL</div>
        <div class="alis"><span>Alış: </span><b>6794,75</b></div>
        <div class="satis"><span>Satış: </span><b>6804,42</b></div>
      </div>
    </div>
  </li>
  <li>
    <div class="box">
      <div class="kur">
        <div class="name">Altın Ons / Dolar</div>
        <div class="alis"><span>Alış: </span><b>4399,33</b></div>
        <div class="satis"><span>Satış: </span><b>4399,63</b></div>
      </div>
    </div>
  </li>
</ul>
<h2 class="mb15">Sarrafiye Altın Fiyatları</h2>
<ul class="datalist">
  <li>
    <div class="box">
      <div class="kur">
        <div class="name">Çeyrek Altın</div>
        <div class="alis"><span>Alış: </span><b>10879</b></div>
        <div class="satis"><span>Satış: </span><b>10962</b></div>
      </div>
    </div>
  </li>
  <li>
    <div class="box">
      <div class="kur">
        <div class="name">Yarım Altın</div>
        <div class="alis"><span>Alış: </span><b>21757</b></div>
        <div class="satis"><span>Satış: </span><b>21932</b></div>
      </div>
    </div>
  </li>
  <li>
    <div class="box">
      <div class="kur">
        <div class="name">Tam Altın</div>
        <div class="alis"><span>Alış: </span><b>43518</b></div>
        <div class="satis"><span>Satış: </span><b>43807</b></div>
      </div>
    </div>
  </li>
</ul>
`;

describe("parseHasAltinHtml", () => {
  it("gram/çeyrek/yarım/tam altın satırlarını alış-satış ortalaması olarak çıkarır", () => {
    const prices = parseHasAltinHtml(SAMPLE_HTML);
    expect(prices).not.toBeNull();
    expect(prices!["GRAM-ALTIN"].toNumber()).toBeCloseTo(6799.585, 3);
    expect(prices!["CEYREK-ALTIN"].toNumber()).toBeCloseTo(10920.5, 3);
    expect(prices!["YARIM-ALTIN"].toNumber()).toBeCloseTo(21844.5, 3);
    expect(prices!["TAM-ALTIN"].toNumber()).toBeCloseTo(43662.5, 3);
  });

  it("altın ons / dolar gibi ilgisiz satırları yok sayar", () => {
    const onlyOunce = `<div class="name">Altın Ons / Dolar</div><div class="alis"><span>Alış: </span><b>4399,33</b></div><div class="satis"><span>Satış: </span><b>4399,63</b></div>`;
    expect(parseHasAltinHtml(onlyOunce)).toBeNull();
  });

  it("beklenen kalıp yoksa (site yapısı değiştiyse) null döner", () => {
    expect(parseHasAltinHtml("<html><body>bakım modu</body></html>")).toBeNull();
  });
});

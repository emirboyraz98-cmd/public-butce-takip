# Tasarım yönü — KARAR BEKLİYOR

İki yön gerçek uygulamada kuruldu (maket değil, kendi bileşenleriyle ve aynı
demo veriyle), ekran görüntüsü alınıp karşılaştırıldı. Karar verilmedi.

Bu klasördeki dosyalar **çalışan koda dahil değil** — seçilen yön
`app/globals.css` ve `app/layout.tsx` üzerine uygulanacak. Konteyner geçici
olduğu için prototip `git stash`'te bırakılmadı, buraya yazıldı.

## Uygulamak için

```bash
cp docs/tasarim/A-globals.css app/globals.css   # ya da B-
cp docs/tasarim/A-layout.tsx.txt app/layout.tsx
```

Layout dosyalarının uzantısı `.tsx.txt`: referans olduklarından derlemeye
ve lint'e katılmasınlar diye. `**/*.tsx` onları da kapsıyordu ve projede
ikinci bir `RootLayout` görünüyordu.

## A — Defter

Zemin hafif soğuk "kâğıt" (`oklch(0.983 0.004 250)`), kartlar beyaz ve
çerçeveli, mürekkep koyu lacivert. Sakin ve yoğun; veri önde, kabuk geride.
Köşe yarıçapı 0.5rem.

## B — Yüzen yüzey

Zemin belirgin mavi tonlu (`oklch(0.962 0.016 243)`), kartlar **çerçevesiz**,
gölgeyle yükseliyor. Aksan canlı mavi, köşe yarıçapı 0.875rem. Daha
"uygulama" hissi.

## İkisinde de ortak (yönden bağımsız düzeltmeler)

- **Sabit genişlikli rakamlar.** `body { font-variant-numeric: tabular-nums }`
  ve büyük tutarlar IBM Plex Mono'da. Öncesinde hiçbir yerde `tabular-nums`
  yoktu; tutar sütunlarında basamaklar hizalanmıyordu — bir bütçe
  uygulamasında bu estetik değil işlevsel bir kusur.
- Arayüz yüzü Geist (Vercel varsayılanı) yerine Instrument Sans.
- Sayfa zemini ile kart zemini artık farklı. Öncesinde ikisi de saf beyazdı,
  kart yalnızca 1px çerçeveyle var oluyordu.

## Dokunulmayacak

`--series-*`, `--cash-*`, `--day-*` paletleri **sabit**. Renk körlüğü ayrımı
ve açıklık bandı için doğrulanmışlardı (en kötü çift ΔE 14.3 / 10.8). Kabuk
paleti onların üstüne değil, onlarla uyumlu kuruldu.

## Süreçten çıkan not

İlk denemede B, A'dan ayırt edilemiyordu: yalnızca buton rengi ve köşe
yarıçapı değişmişti. Ekranı veri ve metin doldurduğu için kabuk token'ları
toplam görüntünün küçük bir kısmı kalıyor. B, yüzey mantığından yeniden
kuruldu (çerçeve → gölge, tonlu zemin). Sonraki turlarda da geçerli:
**token değişikliği tek başına bir yön farkı yaratmıyor, düzen ve yoğunluk
yaratıyor.**

## Sıradaki adımlar (yön seçilince)

1. Token + tipografi commit'i
2. Genel Bakış düzeni: filtre satırı sadeleşsin, açıklama metni katlansın
   (telefonda ilk sayıya ulaşmak için bir ekran boyu kaydırmak gerekiyor)
3. Giderler, Maaş, Gelir, Yatırımlar sırayla

## İlgisiz bulgu

Koyu temada Next.js "2 Issues" rozeti çıkıyor: `ThemeToggle` kaynaklı
hidrasyon uyarısı. `git stash` ile eski koda dönülüp ölçüldü — **tasarım
değişikliğinden gelmiyor, zaten vardı.** Ayrı bir iş.

# Dağıtım ve Gizlilik Planı

> **Güncelleme:** Üye yönetimi kısmı yapıldı (onay kuyruğu + admin paneli).
> Aşağıdaki gizlilik maddesi — veritabanı sahibinin Neon'dan herkesin
> verisini görebilmesi — HÂLÂ ÇÖZÜLMEDİ. Admin paneli o soruna dokunmuyor;
> sadece "kim girebilir" sorusunu çözüyor. Şifreleme kararı bekliyor.

## Problem

Uygulama arkadaş/yakın çevreye dağıtılmak isteniyor. Kullanıcılar birbirinin
verisini göremiyor (denetlendi), ama **veritabanının sahibi Neon konsoluna
girip herkesin verisini görebiliyor.** Neon'da bunu kapatan bir ayar yok; bu
veritabanı sahipliğinin doğası.

> Not: Depo açık kaynak olduğu için en basit çözüm bu belgede tartışılan
> seçeneklerden biri değil — **herkesin kendi kurulumunu yapması.** O zaman
> "veritabanı sahibi" ile "tek kullanıcı" aynı kişi olur ve sorun ortadan
> kalkar. Aşağısı, tek bir kurulumu birden fazla kişiyle paylaşmak istersen
> geçerli.

## Bugünkü durum

Kayıt açık değil: `/register` herkese açık ama kayıt olan **onay bekliyor**,
yönetici `/admin`'den onaylayana kadar giriş yapamıyor. Yönetici hesabı,
kurulumda kaydolan ilk hesaptır.

Admin paneli yalnızca kimlik ve üyelik durumu gösteriyor; hiçbir finansal
alan sorgulanmıyor (uçtan uca doğrulandı: başka bir üyenin harcaması panelin
ne metninde ne HTML'inde geçiyor).

Çözülmemiş tek şey yukarıdaki gizlilik maddesi: **admin paneli veriyi
göstermiyor ama veritabanı sahibi Neon'dan doğrudan bakabiliyor.** Bunu
yalnızca şifreleme (Seçenek B) kapatır.

## Seçenekler

### A. Bugünkü hali (merkezi, şifresiz)

- İş yükü: yok.
- Arkadaş tarafı: link → kayıt → giriş.
- Telefon/bilgisayar senkron: otomatik.
- Eksik: veritabanı sahibi herkesin verisini görebiliyor.

Küçük iyileştirmeler (mimariye dokunmadan):

1. **Davet kodu** — linki bulan herkes kayıt olamasın. (~yarım gün)
2. **Yedek al / dışa aktar** — herkes verisini dosya olarak indirebilsin.
3. **Kısmi şifreleme** — not, kredi adı, kategori adı gibi metin alanları
   kullanıcının şifresiyle şifrelenir. Tutarlar açık kalır (sunucu toplam
   alabilsin diye), ama etiketsiz rakam çok daha az şey anlatır.

### B. Üyelik kalsın + uçtan uca şifreleme ⭐ (son önerilen)

Kayıtlar Neon'da kalır ama tarayıcı, kullanıcının şifresinden türetilen
anahtarla şifreleyip gönderir. Sunucu şifreli veri saklar, hesaplama yapmaz;
bütün matematik tarayıcıda çalışır.

- Kayıt/giriş **aynen kalır** (istenen buydu).
- Cihaz senkronu **otomatik** — ayrı bir senkron işi yok.
- Neon'da olduğu için **yedekli**.
- PGlite gibi olgunlaşmamış bir bileşene bağımlılık yok; şema değişmiyor.
- **Bedeli:** şifresini unutan verisini kaybeder (anahtar sunucuda yok).
  Kayıt sırasında verilecek bir kurtarma anahtarıyla yumuşatılır.
- Tarihler düz metin bırakılabilir ki aya göre filtreleme sunucuda kalsın.

### C. Tarayıcı-içi (sunucusuz)

Uygulama statik siteye dönüşür, veritabanı tarayıcının içinde çalışır.

- Arkadaş tarafı en kolay: link → direkt kullanır, kayıt bile yok.
- **Ama üyeliği siliyor**, cihazlar birbirinden kopuyor, tarayıcı verisi
  temizlenirse veri gidiyor. Yani istenenin tersi yönde.

### D. Herkes kendi deploy'unu yapar

Her arkadaş kendi Vercel + Neon hesabını kurar. Gerçek izolasyon verir ama
teknik olmayan biri için kurulum engeli çok yüksek — elendi.

## Teknik bulgular (2026-08 itibarıyla doğrulandı)

- `@electric-sql/pglite` **0.5.4** — Postgres'in WASM derlemesi, tarayıcıda
  çalışıyor. ElectricSQL şirketi bakıyor.
- `pglite-prisma-adapter` **0.7.2** — peer `@prisma/client >= 7.1.0`
  (projede 7.9.1 ✓). Tek bakımcı (`thevenet`), MIT,
  `github.com/lucasthevenet/pglite-utils`. **Resmi Prisma paketi değil.**
- `@prisma/adapter-pglite` diye resmi bir paket **yok**.
- Projede zaten yeni `prisma-client` generator'ı kullanılıyor — sürücü
  adaptörlerini destekleyen sürüm bu.
- Bu sayede B ve C seçeneklerinde **şema olduğu gibi kalabilir**: 18 model,
  7 enum, `String[]` alanlar, `Decimal`, mevcut migration'lar.

### Risk notu

1.0 öncesi sürümler doğrudan güvenlik açığı değil, **API kararsızlığı** ve
**veri bozulması** riski. `pnpm-lock.yaml` sürümleri kilitliyor. Ayrıca her
iki mimari de saldırı yüzeyini küçültüyor: ortada herkesin verisini tutan
tek bir hedef kalmıyor.

## İş yükü

Dokunulmayan kısım (testlerle korunuyor):

| Katman | Satır | Durum |
|---|---|---|
| `lib/` hesaplama mantığı | 3.327 | aynen kalır |
| `lib/` testleri | 2.810 | aynen kalır |
| `components/` | 3.175 | büyük ölçüde kalır |
| `app/` (12 sayfa, 9 aksiyon, **137 Prisma çağrısı**) | 9.194 | taşınır |

Tahmin: **birkaç oturum** (haftalar değil). Asıl zaman yazmakta değil
doğrulamakta geçiyor, ve iki şey hızlandırılamıyor:

- **Gerçek cihaz testi** (iPhone Safari depolama, ana ekrana ekleme, mobil
  düzen) — sandbox'tan test edilemiyor, kullanıcı deneyip bildirecek.
- **Mevcut verinin taşınması** ve doğru taşındığının kontrolü.

Tahmin, PGlite denenmeden bir tahmindir. İlk adım her zaman kanıt olmalı.

## Yan başlıklar

- **iOS:** bütün tarayıcılar WebKit kullanmak zorunda, Chrome farklı motor
  değil — 7 gün depolama silme kuralı orada da geçerli. Her tarayıcının
  deposu ayrıdır (Safari'deki veri Chrome'da görünmez). Kurulum için Safari
  → Paylaş → Ana Ekrana Ekle yönlendirilmeli.
- **Kur/fiyat sunucusu:** tarayıcıdan TCMB/Yahoo doğrudan çağrılamaz;
  `yahoo-finance2` zaten bir Node kütüphanesi. Statik siteyle **aynı Vercel
  projesinde tek serverless fonksiyon** yeterli — ayrı hesap/ücret yok. Bu
  sunucu hiç kullanıcı verisi görmez, sadece "USD kuru kaç?" sorusunu görür.

## Sıradaki adım

Karar bekliyor. Seçenek B tercih edilirse önce **küçük bir kanıt**: tek bir
ekran (örn. Diğer Giderler) uçtan uca şifreli çalışsın, gerçek maliyet
görülsün, sonra gerisine karar verilsin.

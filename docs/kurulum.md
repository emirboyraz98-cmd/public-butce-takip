# Kurulum: kendi kopyanı aç

Bu rehber, uygulamayı **kendi** Vercel + Neon hesabına kurar. Sonunda sadece
sana ait, verisi kimseyle paylaşılmayan bir bütçe uygulaman olur.

- Süre: ~15 dakika
- Ücret: yok (Neon ve Vercel'in ücretsiz planları yetiyor)
- Gereken: GitHub hesabı. Kod yazmayı bilmene gerek yok.

---

## 1. Depoyu kendi hesabına kopyala

Deponun sayfasında sağ üstteki **Fork** düğmesine bas, sonra
**Create fork** de. Artık depo senin hesabında.

---

## 2. Veritabanını aç (Neon)

1. [neon.tech](https://neon.tech) → **Sign up** (GitHub ile girebilirsin).
2. **Create project** de. Ad fark etmez; bölge olarak sana yakın olanı seç
   (Türkiye için **Europe (Frankfurt)** iyi).
3. Proje açılınca ekranda bir **connection string** çıkar, şuna benzer:

   ```
   postgresql://neondb_owner:AbC123...@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

4. Bunu kopyala, bir kenarda tut. Birazdan Vercel'e yapıştıracaksın.

> **Önemli:** Neon iki tür bağlantı adresi verir. Adresin içinde
> `-pooler` geçiyorsa, **geçmeyenini** (Direct / unpooled) seç. Bu uygulama
> aynı adresi hem kurulum hem çalışma için kullanıyor ve havuzlanmış adres
> kurulum adımında takılabiliyor.

---

## 3. İki tane rastgele metin üret

Vercel'e üç değer gireceksin. Üçünün nereden geldiği farklı — en çok
karışan yer burası:

| Değer | Nereden geliyor? |
|---|---|
| `DATABASE_URL` | **Kopyalanır.** 2. adımdaki Neon adresi. Uydurulmaz, başka bir şey yazılmaz. |
| `AUTH_SECRET` | **Sen üretirsin.** Rastgele bir metin. Hiçbir yerden almıyorsun, hiçbir şeyle eşleşmesi gerekmiyor. |
| `CRON_SECRET` | **Sen üretirsin.** Yine rastgele, ama `AUTH_SECRET`'tan farklı olsun. |

Son ikisi bir daha asla elle yazmayacağın değerler: uygulamanın kendi
kendine kullandığı anahtarlar. Ezberlemene, not almana, birinin
onaylamasına gerek yok — üret, yapıştır, unut. Kimseyle aynı olmaları da
gerekmiyor; her kurulumun kendi anahtarları olur.

**Nasıl üretilir (terminal gerekmez):**

Tarayıcıda `F12` → **Console** sekmesi → şunu yapıştırıp Enter:

```js
btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
```

Tırnaklar arasında şuna benzer bir metin çıkar:

```
"j8Kd2pQmR7vXnB4tLzA9wYcE6fHsU1oI3gN5aP0eT2M="
```

Tırnakların **içindekini** kopyala. Sonra komutu bir kez daha çalıştır ve
çıkan ikinci metni de kopyala. Birincisi `AUTH_SECRET`, ikincisi
`CRON_SECRET` olacak.

Bu metin senin bilgisayarında üretilir, hiçbir siteye gitmez.

Terminal kullanmayı biliyorsan aynısı: `openssl rand -base64 32` (iki kez).

---

## 4. Vercel'e kur

1. [vercel.com](https://vercel.com) → **Sign up** (GitHub ile).
2. **Add New… → Project**.
3. Forkladığın depoyu bul, **Import** de.
4. Framework otomatik **Next.js** görünür, dokunma.
5. **Environment Variables** bölümünü aç ve üç satır ekle:

   | Name (aynen böyle yaz) | Value (buraya ne yapıştıracaksın) |
   |---|---|
   | `DATABASE_URL` | 2. adımda Neon'dan kopyaladığın adres — `postgresql://` ile başlayan uzun satır |
   | `AUTH_SECRET` | 3. adımda ürettiğin **birinci** rastgele metin |
   | `CRON_SECRET` | 3. adımda ürettiğin **ikinci** rastgele metin |

   Her satır için: **Key** kutusuna soldaki adı harfi harfine yaz (büyük
   harf ve alt çizgilerle), **Value** kutusuna değeri yapıştır, **Add** de.
   Üçü de eklenmiş olmalı; biri eksikse deploy hata verir.

   Değerlerin başında/sonunda boşluk ya da tırnak kalmasın.

6. **Deploy** de ve bekle (2–4 dakika).

Kurulum sırasında veritabanı şeması ve Türkiye resmi tatil takvimi
kendiliğinden yükleniyor; elle bir şey yapmana gerek yok.

---

## 5. İlk hesabını aç

Deploy bitince Vercel sana bir adres verir
(`https://senin-projen.vercel.app` gibi). Aç ve sonuna `/register` ekle:

```
https://senin-projen.vercel.app/register
```

Kullanıcı adı ve şifre belirle.

> **İlk kaydolan hesap otomatik olarak yöneticidir** ve doğrudan giriş
> yapabilir. Yani ilk sen kaydol.

---

## 6. Başkasını da eklemek istersen

Eş/arkadaş aynı kuruluma katılabilir:

1. O kişi `/register`'dan kaydolur.
2. Girişi **onay bekler** — yani linki bulan herkes içeri giremez.
3. Sen `/admin` sayfasından onaylarsın.

Kullanıcılar birbirinin verisini göremez. Ama şunu bilerek karar ver:
**veritabanını kuran kişi (sen) Neon panelinden herkesin verisine
bakabilir.** Bunu kapatan bir ayar yok, veritabanı sahipliğinin doğası bu.
Kimsenin verisini görmek istemiyorsan herkes kendi kurulumunu yapsın —
zaten bu rehber tam olarak bunun için var.

---

## 7. İlk ayarlar

Giriş yaptıktan sonra:

1. **Ayarlar** → baz para biriminizi seç (TRY veya USD).
2. **Maaş → Maaş ayarları** → *Baz Maaş Dönemleri*'ne bir dönem ekle:
   - **Maaş Türü**: her ay aynı tutarı alıyorsan **Sabit**, çalıştığın güne
     göre değişiyorsa **Değişken**.
   - **Tutar** ve **Dönem Başlangıcı** (bitişi boş bırakabilirsin).
   - Değişken seçtiysen aynı sayfadaki *Referans Kur Dönemleri*'ne de
     işvereninin kullandığı sabit kuru ekle.
3. Değişken maaştaysan **Maaş** sayfasındaki takvimden çalıştığın günleri
   işaretle (sürükleyerek aralık seçebilir, "Tüm ayı seç" ile bir ayın
   tamamını bir tıkla işaretleyebilirsin).
4. Gelir, gider ve yatırımlarını kendi sekmelerinden girmeye başla.

---

## Takılırsan

**Deploy kırmızı, hata "AUTH_SECRET" ya da "MissingSecret" diyor.**
`AUTH_SECRET` eklenmemiş ya da boş kalmış. Settings → Environment
Variables'dan ekleyip **Redeploy** de.

**Deploy kırmızı, hata "migrate" diyor.**
`DATABASE_URL` yanlış ya da havuzlanmış adres olabilir. Neon'daki
**Direct connection** adresini (içinde `-pooler` geçmeyeni) kullan.
Vercel → Settings → Environment Variables'dan düzeltip
**Deployments → ⋯ → Redeploy** de.

**Girişte "kullanıcı adı veya şifre hatalı" ama doğru yazıyorum.**
İlk kullanıcı değilsen hesabın onay bekliyordur. Yöneticinin `/admin`'den
onaylaması gerekiyor.

**"Baz maaş tanımlı değil" uyarısı görüyorum.**
Normal — 7. adımdaki baz maaş dönemini henüz eklememişsin.

**Yatırım fiyatları güncellenmiyor.**
`CRON_SECRET` eksik olabilir. Ayrıca günlük görev sadece canlı (production)
dağıtımda çalışır, önizleme dağıtımlarında çalışmaz.

**Şifremi unuttum.**
Şifre sıfırlama ekranı yok. Yönetici olarak Neon panelinden ilgili
kullanıcıyı silip yeniden kaydolabilirsin.

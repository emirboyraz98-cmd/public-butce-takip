# Bütçe Takip

Çok kullanıcılı kişisel finans takip uygulaması: maaş, gelir, gider, kredi
kartı, kredi, yatırım ve bütçe — hepsi tek nakit akışında.

Kendi Vercel + Neon hesabına kurulmak üzere yazıldı. Ortak bir sunucu yok;
kuran herkes kendi veritabanının sahibi olur.

## Ne yapıyor

- **Maaş** — Sabit ya da gün bazlı (değişken) hesaplama, ve bu seçim baz maaş
  *dönemine* ait: işini değiştirince geçmiş ayların kendi yöntemiyle
  hesaplanmış hâli bozulmaz. Değişken dönemlerde çalışma günleri takvimden
  işaretlenir; pazar ve resmi tatiller kendi katsayılarıyla girer, bordro ayı
  30 güne normalize edilir. Bankaya yatan tutar girilip hesaplananla
  karşılaştırılabilir.
- **Gelir / Gider** — Kategori bazlı kayıt, tekrarlayan kalemler, kredi kartı
  ekstresi (taksit + devreden bakiye) ve kredi taksitleri ayrı ayrı izlenir.
- **Yatırımlar** — Alış/satış işlem defteri, oradan türetilen pozisyonlar,
  günlük fiyat güncellemesi, gerçekleşmiş/gerçekleşmemiş kâr-zarar. Satıştan
  gelen para nakit akışına dahil edilmeden "yatırımda bekleyen nakit" olarak
  da tutulabilir.
- **Genel Bakış** — Aylık gelir/gider/net akışı; maaş hak edildiği ayda değil
  ödendiği ayda, kart borcu ekstre yerine gerçekten ödendiği ayda sayılır.
- **Bütçeler ve Raporlar** — Kategori limitleri, tasarruf oranı, dönem
  karşılaştırmaları.
- **Çoklu para birimi** — Her tutar kendi para biriminde saklanır; toplamlar
  ait olduğu ayın TCMB ortalama kuruyla çevrilir, yani geçmiş aylar bugünkü
  kur değişince değişmez.

Arayüz Türkçe.

## Teknoloji

Next.js 16 (App Router) · TypeScript · Prisma 7 (`@prisma/adapter-pg`) ·
PostgreSQL · Auth.js v5 (Credentials + JWT) · Tailwind CSS v4 + shadcn/ui ·
Zod v4 · react-hook-form · Recharts · Vitest

---

## Kurulum (Vercel + Neon)

> Hiç kod yazmadan, ekran ekran anlatan sürüm:
> [`docs/kurulum.md`](docs/kurulum.md). Aşağısı özet.

### 1. Veritabanı

[Neon](https://neon.tech) üzerinde ücretsiz bir Postgres projesi aç ve
bağlantı stringini kopyala (`postgresql://...?sslmode=require`).

Neon şart değil — herhangi bir PostgreSQL 14+ sunucusu çalışır.

### 2. Vercel

Depoyu Vercel'e import et ve şu ortam değişkenlerini gir (`.env.example`
bunların hepsini açıklıyor):

| Değişken | Zorunlu | Ne işe yarıyor |
|---|---|---|
| `DATABASE_URL` | evet | Postgres bağlantı stringi |
| `AUTH_SECRET` | evet | Oturum imzalama anahtarı — `npx auth secret` ya da `openssl rand -base64 32` |
| `CRON_SECRET` | evet* | Günlük fiyat/kur tazeleme ucunu korur. Tanımlı değilse uç **bütün** istekleri reddeder ve fiyatlar hiç güncellenmez. `openssl rand -base64 32` |
| `EXCHANGERATE_HOST_API_KEY` | hayır | Kur için birincil kaynak TCMB/Frankfurter; bu anahtar yalnızca onlara ulaşılamadığında kullanılır |

\* Teknik olarak uygulama onsuz da ayağa kalkar, ama yatırım fiyatları ve
kurlar güncellenmez.

Deploy sırasında `pnpm build` şunları sırayla çalıştırır:

```
prisma migrate deploy   # şemayı kurar/günceller
prisma db seed          # Türkiye resmi tatil takvimini yükler
next build
```

Yani boş bir veritabanına ilk deploy şemayı kendisi kurar; elle migration
çalıştırmana gerek yok.

### 3. İlk hesap = yönetici

`/register` adresinden kayıt ol. **İlk kaydolan hesap otomatik olarak
yönetici olur ve doğrudan aktifleşir.** Sonraki kayıtlar onay bekler;
yönetici `/admin` sayfasından onaylar. Böylece linki bulan herkes içeri
giremez.

Yönetici paneli yalnızca kimlik ve üyelik durumu gösterir — başka kimsenin
finansal verisi sorgulanmaz.

### 4. Günlük görev

`vercel.json` her gün 06:00 UTC'de `/api/cron/refresh-prices` ucunu tetikler
(fiyatlar + kurlar). Vercel, `CRON_SECRET` tanımlıysa isteğe
`Authorization: Bearer <değer>` başlığını kendisi ekler.

---

## Yerel geliştirme

```bash
pnpm install
cp .env.example .env      # değerleri doldur
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
pnpm dev
```

Prisma Client `generated/prisma` altına üretilir (git'e dahil değil) ve
`@/generated/prisma/client` üzerinden import edilir.

```bash
pnpm test                      # Vitest
pnpm lint                      # ESLint
pnpm exec prisma studio        # veriyi görsel incele
pnpm exec prisma migrate dev   # yeni migration üret
```

---

## Bilmen gerekenler

**Veritabanı sahibi her şeyi görebilir.** Kullanıcılar birbirinin verisini
göremez (uçtan uca denetlendi), ama veritabanını kuran kişi Neon konsolundan
bütün kayıtlara bakabilir — bu, veritabanı sahipliğinin doğası, kapatan bir
ayar yok. Bu yüzden *herkes kendi kurulumunu yapsın* diye tasarlandı.
Alternatifler ve uçtan uca şifreleme tartışması:
[`docs/dagitim-ve-gizlilik-plani.md`](docs/dagitim-ve-gizlilik-plani.md).

**Fiyat ve kur kaynakları** dış servislerdir (TCMB, Frankfurter, Yahoo
Finance, CoinGecko). Hepsi ücretsiz ve anahtarsızdır; erişilemediğinde
uygulama çöker değil, en son bilinen değerle devam eder ve arayüzde uyarır.

**Gmail'den harcama aktarımı** isteğe bağlı bir özellik: uygulama Gmail'e
kendisi bağlanmaz, kendi Google hesabında çalışan bir Apps Script
harcama bildirimlerini uygulamaya POST eder. Kurulumu
[`docs/gmail-aktarim.md`](docs/gmail-aktarim.md) anlatıyor.

**Resmi tatiller** Türkiye takvimine göre `lib/salary/publicHolidays.ts`
içinde gömülü. Başka bir ülkede kullanacaksan orayı değiştir.

## Lisans

MIT — bkz. [LICENSE](LICENSE).

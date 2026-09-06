# Açık Konular

Konuşmanın kaybolmaması için tutuluyor. Bir madde kapandığında buradan sil.

---

## 1. "Diğer Giderler" sekmesinin adı — KARAR BEKLİYOR

**Sorun:** İsim dışlamayla tanımlanıyor ("geri kalanlar"), oysa bu sekme asıl
kova: kira, vergi, aidat oraya giriyor. En çok kullanılan yere "diğer" demek
ters. Tasarımla ilgisi yok, sadece isim.

**Bağlam:** Üç sekme *nasıl ödediğine* göre ayrılıyor — nakit/havale/otomatik
ödeme | kredi kartı | kredi taksiti. Yeni isim de o eksende olmalı.

**Masaya konan seçenekler:**

| Aday | Lehte | Aleyhte |
|---|---|---|
| **Nakit & Banka** (önerilen) | Nakit + havale + banka kartı + otomatik ödemeyi kapsar; "Kredi Kartı" ile aynı eksende; ne olduğunu söyler | — |
| Doğrudan Ödemeler | En kesin anlam (para anında çıkıyor); hiçbir yöntemi dışlamaz | Biraz resmi/soyut |
| Nakit & Havale | Şemadaki tanımla birebir | Banka kartı ne nakit ne havale — kullanıcı duraksar |
| Günlük Harcamalar | Samimi | Yanıltıcı: yıllık vergi/aidat da bu sekmede, "günlük" sıklık belirtir |

**Not:** Bu yalnızca gösterim. `ExpenseKind.OTHER` enum değeri olduğu gibi
kalmalı — veritabanı enum'unu yeniden adlandırmak bedava olmayan bir migration
ve hiçbir şey kazandırmaz.

**Değişmesi gereken yerler (isim seçilince):**

- `app/(app)/expenses/page.tsx` — sekme etiketi (~354), kart başlığı (~447),
  kaynak etiketi (~240)
- `components/charts/CashFlowChart.tsx` — efsane/tooltip "Diğer Gider"
  (172, 502, 595)
- `lib/tours/content.ts` — tanıtım turu metni (~164)
- `lib/validation/expense.ts` — yorum (~19)
- `prisma/schema.prisma` — `ExpenseKind` üstündeki yorum (33)

---

## 2. Faz 5: Deploy — YAPILMADI

Görev listesindeki #6. Yayına alınmadan dağıtım yapılamaz.

Deploy sırasında hatırlanacaklar:

- **Neon pooled connection string** kullanılmalı (kod değil, ortam ayarı).
- Deploy sonrası bir kez doğrula: `select username, role from "User";`
  ADMIN senin hesabın olmalı. Değilse:
  ```sql
  UPDATE "User" SET role='USER'  WHERE role='ADMIN';
  UPDATE "User" SET role='ADMIN' WHERE username='<senin_kullanıcı_adın>';
  ```
- `build` script'i `prisma migrate deploy` çalıştırıyor; bekleyen
  migration'lar (formulaVersion, gün istisnaları, üyelik onayı) orada uygulanır.

---

## 3. Gizlilik: veritabanı sahibi herkesin verisini görebiliyor — ÇÖZÜLMEDİ

Ayrıntı: `docs/dagitim-ve-gizlilik-plani.md`.

Üyelik onayı ve admin paneli **bu sorunu çözmüyor** — onlar "kim girebilir"
sorusunu çözüyor. Admin paneli hiçbir finansal alan sorgulamıyor (doğrulandı),
ama Neon konsolundan tablolar hâlâ okunabiliyor. Bunu yalnızca şifreleme
(plandaki Seçenek B) kapatır. Karar bekliyor.

---

## 4. Bilinen teknik borç: maaş modülü UTC varsayıyor

`computeMonth.ts`, `computeAndSave.ts` ve `monthCalendar.ts` ayı `Date.UTC`
ile kuruyor ama date-fns'in yerel saatle çalışan yardımcılarını çağırıyor.
`TZ=America/Los_Angeles` ile maaş testlerinden 26 tanesi düşüyor.

Üretimde etkisi yok (Vercel UTC'de koşuyor) ve takvim motorla birebir aynı
deseni kullandığı için ikisi asla çelişmiyor. Yine de kırılgan; sunucu saati
değişirse sessizce yanlış hesaplar. Ayrı bir iş olarak ele alınmalı — takvimi
tek başına "düzeltmek" motorla ayrışmasına yol açar, ikisi birlikte
değişmeli.

# Gmail'den otomatik harcama aktarımı

Akbank'ın kart harcama bildirim mailleri okunup **Kredi Kartı** sekmesindeki
onay kutusuna düşürülür. Kurulum bir kereliktir, ~10 dakika sürer.

## Nasıl çalışıyor

```
Gmail (Akbank etiketi)
  └─ Apps Script          senin Google hesabında, 10 dakikada bir
       └─ POST /api/import/akbank    Authorization: Bearer <anahtar>
            ├─ gönderen doğrulaması  bilgi.akbank.com değilse reddedilir
            ├─ metin ayrıştırma      tutar, sektör, taksit, kart son 4 hane
            ├─ tekilleştirme         (kullanıcı, Gmail mesaj kimliği) benzersiz
            └─ kur çevrimi           yabancı para → baz para birimi
                 └─ onay kutusu → [Onayla] → gider kaydı
```

## Neden uygulama Gmail'e kendisi bağlanmıyor

Gmail okuma izni (`gmail.readonly`) Google'ın **kısıtlı kapsam** listesinde.
Yayınlanmış bir uygulamanın bu izni kullanabilmesi için Google'ın ücretli
güvenlik denetiminden geçmesi gerekiyor. Script senin kendi hesabında
çalıştığı için o denetim gerekmiyor; ayrıca uygulama hiçbir Google kimlik
bilgisi (token, şifre, yenileme anahtarı) saklamıyor. Depo başkasına
çatallandığında (fork) bu bağlantı karşı tarafa geçmez — script senin
hesabında kalır.

## Kurulum

1. **Ayarlar → Gmail'den Otomatik Harcama Aktarımı** bölümünde anahtar üret.
   Anahtar bir kez gösterilir; kopyalamayı kaçırırsan yenisini üretmen gerekir
   (veritabanında yalnızca SHA-256 özeti duruyor, geri getirilemez).
2. Gmail etiketinin adını yaz (varsayılan `Akbank`). Büyük/küçük harf önemli.
3. [script.google.com](https://script.google.com/home/projects/create)
   adresinde yeni proje aç.
4. **⚙ Proje Ayarları** → *"appsscript.json bildirim dosyasını editörde
   göster"* kutusunu işaretle.
5. **Düzenleyici**'ye dön, `appsscript.json`'ı aç, içindekini silip sayfadaki
   **ilk kutuyu** yapıştır ve kaydet. Bu dosya izinleri okumayla sınırlar ve
   `kur` çalıştırılmadan ÖNCE kaydedilmelidir.
6. `Kod.gs`'e geç, içindekini silip **ikinci kutuyu** yapıştır ve kaydet.
   Adres ve anahtar koda gömülü gelir.
7. Fonksiyon listesinden **`kur`** seçip çalıştır. İzin ekranında yalnızca
   *"görüntüleme"* yazmalı — gönderme ya da silme geçmemeli.
8. Aynı listeden **`dene`** seçip çalıştır: en son Akbank mailini zaman
   damgasına bakmadan gönderir ve sunucunun cevabını yazar. `HTTP 200`
   görüyorsan bağlantı kuruldu demektir.

`kur` 10 dakikalık tetikleyiciyi kurar ve "şu andan itibaren" damgasını atar.

`dene` gerçekten aktarım yapar; gönderdiği mail onay kutusunda görünür.
İstemiyorsan oradan **Sil** dersin. Tekrar çalıştırmak yeni kayıt açmaz.

## İzinler

Apps Script, gereken izinleri kullanılan **sınıfa** bakarak belirliyor —
çağrılan metotlara değil. `GmailApp` sınıfında silme ve gönderme de olduğu
için, `appsscript.json` olmadan yalnızca okuyan bu script'e bile *"tüm
e-postalarınızı okuma, oluşturma, gönderme ve kalıcı olarak silme"* izni
istenir. Kurulumdaki manifest bunu engelliyor:

| Kapsam | Ne için |
|---|---|
| `gmail.readonly` | Mailleri okumak — silme/gönderme yok |
| `script.external_request` | `UrlFetchApp` ile uygulamaya göndermek |
| `script.scriptapp` | 10 dakikalık tetikleyiciyi kurmak |

`PropertiesService` ayrı bir izin istemiyor; script'in kendi içinde kalıyor.

**Geniş izinle bağladıysan:** manifesti sonradan eklemek verilmiş izni
daraltmaz. [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
adresinden projenin erişimini kaldır, sonra `kur`'u tekrar çalıştır. Bu
tetikleyiciyi de sıfırlar; `kur` başlangıç damgasını yenilediği için arada
kalan harcamalar atlanır — kaçırmak istemiyorsan `dene`'yi birkaç kez
çalıştır ya da elle gir.

## Bilinmesi gerekenler

**Geçmiş aktarılmaz.** İlk çalıştırma hiçbir şey göndermez, yalnızca başlangıç
anını damgalar. Geçmişi de istersen Apps Script'te
`ScriptProperties → sonCalisma` değerini daha eski bir zaman damgasıyla
değiştir.

**İşyeri adı gelmiyor.** Banka mailde marka yazmıyor, yalnızca **sektör**
gönderiyor: "GIDA VE MARKET", "YEMEK", "BENZIN ISTASYONU". Sektörü
çözemediğinde de "KREDI KARTI" yazıyor — bu kayıtlar kategorisiz gelir ve
onay kutusunda seçilmeleri gerekir. Örnek bir üç aylık dönemde harcamaların
yaklaşık **%63'ü** kategorisiyle geldi, **%37'si** bankanın genel kovasına
düştü.

**Yurt dışı tutarları eksik kalır.** Mail yabancı tutarı veriyor ("120,00
EUR"), TL karşılığını vermiyor. Uygulama kendi kuruyla çeviriyor ama banka
buna ayrıca **~%2 yurt dışı komisyonu + BSMV** ekliyor. Yani içeri giren tutar
ekstredekinden bir miktar düşük olur. Kur hiç bulunamazsa (Frankfurter dar bir
para birimi listesi taşıyor; MAD gibi kodlar yok) tutar boş bırakılır ve onay
kutusunda elle girilir — uydurma kurla kayıt açılmaz.

**İptaller eşleştirilir.** "Kredi kartı harcamanız iptal olmuştur" maili ayrı
bir tür olarak gelir. Onay kutusunda **İptali uygula** dediğinde kartın son
dört hanesi + özgün tutar ile eşleşen onaylanmış harcama bulunur ve silinir.
Eşleşme bulunamazsa uyarır.

**Aynı mail iki kez gelirse tek kayıt olur.** Tekilleştirme Gmail mesaj
kimliğine bağlı ve veritabanı indeksiyle zorlanıyor; script'i elle
çalıştırman ya da tetikleyicinin çakışması sorun çıkarmaz.

## Sorun giderme

| Belirti | Bakılacak yer |
|---|---|
| Hiçbir şey gelmiyor | Ayarlar'da anahtarın **son kullanım** tarihi boşsa script hiç ulaşamamış: Apps Script → *Yürütmeler* sekmesindeki hataya bak. Script yeni mail olmasa da 10 dakikada bir yoklama gönderir, yani bu tarih her koşulda ilerlemeli |
| `Gmail'de böyle bir etiket yok` | Etiket adını Gmail'de göründüğü gibi yaz; alt etiketlerde tam yol gerekir (`Bankalar/Akbank`) |
| `401` | Anahtar iptal edilmiş ya da yanlış kopyalanmış — yenisini üretip kodu güncelle |
| `403` | Hesabın onay bekliyor ya da devre dışı |
| Kayıt geliyor ama ekstre ayı yanlış | Kredi Kartı sekmesindeki **hesap kesim günü** ayarını düzelt |

## Uç nokta

`POST /api/import/akbank`

```jsonc
// Authorization: Bearer <tokenId>.<secret>
{
  "messages": [
    {
      "id": "gmail-mesaj-kimliği",
      "subject": "Kredi kartı harcamanız",
      "from": "HIZMET@bilgi.akbank.com",
      "date": "2026-08-16T17:22:06Z",
      "body": "Değerli Akbanklı, ..."
    }
  ]
}
```

İstek başına en fazla **50 mesaj**, mesaj gövdesi en fazla **20.000 karakter**.

```jsonc
{
  "imported": 3,      // yeni açılan kayıt
  "duplicates": 1,    // daha önce gelmiş, atlandı
  "skipped": [        // ayrıştırılamayan; gerekçesiyle birlikte
    { "id": "...", "reason": "Harcama kalıbı bulunamadı" }
  ]
}
```

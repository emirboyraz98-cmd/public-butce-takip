export type TourStep = {
  title: string;
  /** Her paragraf ayrı satır olarak gösterilir. */
  body: string[];
};

export type Tour = {
  /** Veritabanında saklanan anahtar; sayfa yolundan türetilir. */
  key: string;
  /** Turun başlığı (ilk adımın üstünde görünür). */
  pageName: string;
  steps: TourStep[];
};

/**
 * Sayfa yolu -> tur anahtarı. Alt sayfalar (örn. /expenses/categories) ana
 * sekmenin turunu paylaşır; her alt sayfada ayrı tur çıkarmak yorucu olurdu.
 */
export function tourKeyForPath(pathname: string): string | null {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/salary")) return "salary";
  if (pathname.startsWith("/income")) return "income";
  if (pathname.startsWith("/expenses")) return "expenses";
  if (pathname.startsWith("/investments")) return "investments";
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}

export const TOURS: Record<string, Tour> = {
  dashboard: {
    key: "dashboard",
    pageName: "Genel Bakış",
    steps: [
      {
        title: "Hoş geldin! 👋",
        body: [
          "Bu uygulama maaşını, gelir-giderlerini ve yatırımlarını tek yerde takip etmen için hazırlandı.",
          "Her sekmeye ilk kez girdiğinde böyle kısa bir tanıtım göreceksin. Bir kez okuduktan sonra bir daha çıkmayacak.",
        ],
      },
      {
        title: "Üstteki üç kart",
        body: [
          "Portföy Değeri: açık yatırım pozisyonlarının güncel toplam değeri.",
          "Açık Pozisyon Kâr/Zarar: henüz satmadığın yatırımların kâğıt üstündeki kâr/zararı.",
          "Bu Ayki Net Nakit Akışı: bu ayın gelirlerinden giderlerini çıkarınca kalan.",
        ],
      },
      {
        title: "Nakit akışı grafiği",
        body: [
          "Aylara göre gelir ve giderlerini karşılaştırır. Üstteki düğmelerle sadece gelire ya da sadece gidere odaklanabilirsin.",
          "Sütunların üstünde yalnızca o ayın TOPLAMI yazar. Kalem kalem dökümü görmek için sütunun üzerine gel; bir aya tıklarsan kategori dağılımı grafiğin altında açılır.",
          "Renkler iki aileye ayrılır: gelirler soğuk tonlarda (mavi, turkuaz), giderler sıcak tonlarda (sarı, turuncu, bordo). İçinde bulunduğun ay alttaki eksende kalın yazılır.",
        ],
      },
      {
        title: "Yatırım da nakit akışında",
        body: [
          "Yatırım bir harcama değildir — parayı harcamazsın, başka bir varlığa çevirirsin. Ama cebinden çıkan paradır, o yüzden nakit akışında mor renkte ayrı bir kalem olarak görünür.",
          "O ay içindeki alım ve satımlar netleştirilir: 100 bine satıp 200 bine yeni bir şey aldıysan grafikte 100 bin görürsün, yani gerçekten cebinden çıkan. Alım, satış ve realize kâr dökümü sütunun üzerine gelince çıkar.",
          "Net satış yaptığın ay bu kalem gelir tarafına geçer ve adı \"Yatırımdan Çekilen\" olur.",
          "Yatırım, Giderler sekmesindeki harcama alışkanlığı dağılımına GİRMEZ; orası ne tükettiğini gösterir.",
        ],
      },
      {
        title: "Geleceği planlama",
        body: [
          "Tarih aralığını ileri aylara uzatabilirsin (+3 Ay, +6 Ay, +1 Yıl). Seçtiğin aralık sekmeler arasında gezerken korunur; çıkış yapıp tekrar girdiğinde son 6 aya döner.",
          "Gelecek aylarda aylık tekrarlayan gelir ve giderlerin ileriye taşınır; böylece finansal durumunun nereye gittiğini görebilirsin. Bu aylar projeksiyondur, grafiğin açıklamasında da belirtilir.",
        ],
      },
      {
        title: "Tutarların para birimi",
        body: [
          "Farklı para birimlerindeki tüm kayıtlar, sağ üstten seçtiğin baz para birimine çevrilerek toplanır.",
          "Aylık gelir/giderler ait oldukları ayın TCMB ortalama kuruyla çevrilir — böylece kur değiştikçe geçmiş aylar da değişmez. Portföy değeri ise bugünkü durumu gösterdiği için güncel kuru kullanır.",
          "Bir tutarın nasıl hesaplandığını merak edersen, yanındaki (i) simgesine tıkla.",
        ],
      },
    ],
  },

  salary: {
    key: "salary",
    pageName: "Maaş",
    steps: [
      {
        title: "Maaş türü döneme ait",
        body: [
          "Sabit: her ay aynı tutarı alıyorsan. Maaş ayarları'ndan dönem ve tutarı girmen yeterli, başka bir şey yapmana gerek yok.",
          "Değişken: çalıştığın güne göre değişiyorsa. Bu türde çalıştığın günleri takvimden işaretlersin.",
          "Tür kullanıcıya değil, Maaş ayarları'ndaki baz maaş DÖNEMİNE ait. İşin değişince eski dönemi kapatıp yenisini başka türde açarsın: geçmiş aylar kendi yöntemiyle hesaplanmış kalır, yeni aylar yeni yöntemle hesaplanır.",
        ],
      },
      {
        title: "Çalışma takvimi",
        body: [
          "Değişken dönemlerde tek giriş takvim: bir güne tıkla ya da sürükleyerek aralık seç, sonra Çalışıldı / İzin uygula. Bir ayın tamamı için 'Tüm ayı seç' yeter.",
          "Çalışılan her gün sabit 7,5 saat normal + 2,5 saat mesai kabul edilir; saat girişi yapılmaz.",
          "Pazar günleri ve resmi tatiller farklı katsayılarla hesaplanır: 'Çalışıldı' dediğin aralıkta pazarlar pazar, resmi tatiller tatil sayılır — resmi tatil takvimi sistemde hazır.",
          "Hiç işaretlenmemiş günler kesikli çerçeveyle gösterilir ve maaşa hiç katılmaz. Bir aralığı geri almak için günleri seçip Temizle de.",
          "Bordro ayı her zaman 30 gün sayar: ayın tamamını işaretlediysen 31 günlük aylarda 1 normal gün düşülür, şubatta 2 gün eklenir. İzin ve resmi tatil günlerine dokunulmaz.",
        ],
      },
      {
        title: "Baz maaş ve referans kur",
        body: [
          "Maaş ayarları'ndan dönem bazlı baz maaşını, o dönemin maaş türünü ve (değişken dönemler için) işvereninin kullandığı referans döviz kurunu girersin.",
          "Maaş önce USD üzerinden hesaplanır, sonra referans kur ile o ayın gerçek TCMB ortalama kuru arasındaki fark düzeltilir.",
        ],
      },
      {
        title: "Otomatik hesaplama",
        body: [
          "Bir dönem eklediğinde ya da sildiğinde ilgili aylar kendiliğinden yeniden hesaplanır; elle bir düğmeye basman gerekmez.",
          "Bir ayın TCMB kuru henüz yayınlanmadıysa, veri bulunan en son ayın kuru geçici olarak kullanılır ve tabloda \"(geçici kur)\" etiketiyle işaretlenir.",
        ],
      },
      {
        title: "Gerçekleşen ödeme",
        body: [
          "Hesaplanan tutarın yanında, bankaya gerçekten yatan tutarı da girebilirsin.",
          "Maaşın ertesi ay yatıyorsa Ayarlar'dan \"Ödeme zamanı\"nı seç: Genel Bakış maaşı ödendiği aya taşır, böylece nakit akışı gerçekten eline geçeni gösterir. Bu sayfa ise hak edişi göstermeye devam eder.",
          "Böylece hesaplama ile gerçek ödeme arasındaki farkı hem tabloda hem de grafikte görebilirsin.",
        ],
      },
    ],
  },

  income: {
    key: "income",
    pageName: "Gelir",
    steps: [
      {
        title: "Maaş dışı gelirler",
        body: [
          "Kira geliri, prim, ek iş gibi maaş dışındaki gelirlerini buraya kaydedersin.",
          "Maaşını buraya girmene gerek yok; o Maaş sekmesinden otomatik hesaplanıp Genel Bakış'a dahil edilir.",
        ],
      },
      {
        title: "Tek seferlik mi, aylık mı?",
        body: [
          "Tek seferlik: sadece girdiğin ayda sayılır.",
          "Aylık: girdiğin aydan itibaren her ay tekrar eder. Düzenli gelirler için bunu seç — Genel Bakış'taki gelecek ay projeksiyonu bu kayıtları ileriye taşır.",
        ],
      },
      {
        title: "Düzenleme ve dağılım",
        body: [
          "Tablodaki her satırı \"Düzenle\" ile yerinde değiştirebilirsin: tarih, kategori, tutar, para birimi, tekrar ve not.",
          "Üstteki grafik seçtiğin ayın gelirlerini kategorilere göre dağıtır; ay seçiciyle başka aylara da bakabilirsin.",
        ],
      },
    ],
  },

  expenses: {
    key: "expenses",
    pageName: "Giderler",
    steps: [
      {
        title: "Üç sekme, üç farklı gider türü",
        body: [
          "Genel Giderler: nakit, havale veya otomatik ödemeyle yaptıkların — kira, vergi, hediye gibi.",
          "Kredi Kartı: kartla yaptığın harcamalar.",
          "Krediler: aylık kredi taksitlerin.",
          "Bir harcamayı yalnızca TEK bir sekmeye gir; aynı şeyi iki yere yazarsan Genel Bakış'ta iki kez sayılır.",
        ],
      },
      {
        title: "Tek seferlik mi, aylık mı?",
        body: [
          "Kira, faturalar, abonelikler gibi her ay tekrar eden giderler için \"Aylık\" seç.",
          "Aylık işaretlenen giderler, Genel Bakış'taki gelecek ay projeksiyonuna otomatik dahil olur.",
        ],
      },
      {
        title: "Kredi kartında iki ayrı tarih var",
        body: [
          "Harcama tarihi: kartı ne zaman kullandığın. Ödeme ayı: ekstrenin ne zaman ödendiği.",
          "Temmuzda harcayıp ağustosta ödüyorsan, Genel Bakış o parayı ağustosta gider yazar — çünkü cebinden o zaman çıkıyor.",
          "Kategori dağılımı ise harcama tarihine bakar; \"temmuzda neye ne kadar verdim\" sorusunun cevabı temmuzda kalır.",
          "Ekstre gecikmesini bir kez ayarlarsın, her yeni kayıtta otomatik dolar.",
          "Taksitli aldıysan TOPLAM tutarı yaz ve taksit sayısını seç; uygulama aylık taksiti kendisi böler. Kategori dağılımında harcama yine tam tutarıyla görünür, nakit akışına ise aya bölünmüş olarak girer.",
        ],
      },
      {
        title: "Kredilerde ödeme dönemleri",
        body: [
          "Önce krediyi açarsın: adı, ilk ve son taksit ayı, aylık taksit tutarı.",
          "Taksit ileride değişecekse \"Ödeme dönemi ekle\" ile yeni bir dönem açarsın; eski dönem o ayda otomatik kapanır.",
          "Son taksit ayını girmezsen kredi projeksiyonda sonsuza kadar sürer — bu yüzden uyarı görürsün.",
          "Birden fazla kredin aynı anda ilerleyebilir; bir ayın kredi gideri hepsinin toplamıdır.",
          "\"Ödeme takvimi\" satırını açarsan taksitleri ay ay görürsün; \"Kalan\" etiketli olanların toplamı kartta yazan kalan borçtur. Yandaki kutucuklar isteğe bağlıdır, ödedikçe işaretleyip kendi takibini yapabilirsin.",
        ],
      },
      {
        title: "Ekstre defteri ve asgari ödeme",
        body: [
          "Kredi Kartı sekmesinin altındaki Ekstre Defteri, her ay ne kadar borcun olduğunu ve ne kadarını ödediğini tutar.",
          "Uygulama varsayılan olarak ekstrenin tamamının ödendiğini kabul eder. Asgari ödeme yaptığın bir ayda gerçekte ödediğin tutarı \"Ödenen\" sütununa yazarsın; ödenmeyen kısım sonraki ayın borcuna eklenir.",
          "Genel Bakış'taki nakit akışı bu deftere bakar, yani gerçekte cebinden çıkanı gösterir. Kart ödemesini ayrıca gider olarak yazma, iki kez sayılır.",
        ],
      },
      {
        title: "Harcama alışkanlığı",
        body: [
          "Sayfanın altındaki dağılım üç sekmenin hepsini bir arada gösterir: kart harcamaları, diğer giderler ve o ayın kredi taksitleri.",
          "Ödemeyle ilgisi yoktur — paranın ne zaman çıktığına değil, harcamanın ne zaman yapıldığına bakar. Taksitli bir alışveriş, alındığı ayda tutarının tamamıyla görünür.",
          "\"Kaynak\" düğmeleriyle sadece kredi kartını ya da sadece diğer giderleri süzebilirsin. Sağ üstteki Pasta/Sütun düğmesiyle görünümü değiştirirsin: sütun görünümünde tek bir kalemin aylara göre seyrini izlersin (\"yemeğe her ay ne kadar veriyorum?\").",
        ],
      },
      {
        title: "Düzenleme ve kategoriler",
        body: [
          "Yanlış girdiğin bir kaydı silmene gerek yok; satırdaki \"Düzenle\" ile yerinde düzeltebilirsin.",
          "Tutar alanına kuruş girebilirsin (örn. 1234,56) — virgül de nokta da kabul edilir.",
          "Listeler en yeni 5 kayıt kadar yer kaplar, gerisi kendi içinde kaydırılır. Tamamını görmek istersen altındaki \"Genişlet\" düğmesine bas.",
          "\"Kategorileri yönet\" sayfasından kullanmadığın bir kategoriyi gizleyebilirsin: seçim listelerinden düşer ama eski kayıtların etiketi korunur. Kayıtları başka bir kategoriye taşıyıp tamamen de silebilirsin.",
        ],
      },
    ],
  },

  investments: {
    key: "investments",
    pageName: "Yatırımlar",
    steps: [
      {
        title: "Her şey işlem defterinden hesaplanır",
        body: [
          "En alttaki İşlem Defteri'ne yaptığın her alış ve satışı ayrı ayrı girersin.",
          "Adet, ortalama maliyet ve kâr/zarar bu kayıtlardan otomatik hesaplanır. Ayrıca bir \"pozisyon\" tablosu tutulmaz, yani iki yer birbiriyle çelişemez.",
        ],
      },
      {
        title: "Elindeki yatırımları ilk kez girerken",
        body: [
          "Uygulamaya başlamadan önce sahip olduğun yatırımları girerken, alış satırındaki \"Açılış pozisyonu\" kutucuğunu işaretle.",
          "İşaretlersen: maliyet ve kâr/zarar hesabına normal girer, ama Genel Bakış'taki nakit akışına YAZILMAZ. Çünkü o para uygulama daha yokken çıkmıştı; yazılsaydı ilk ayın kocaman bir yatırım çıkışı gibi görünürdü.",
          "Gerçek alış tarihini hatırlıyorsan onu girmen de yeterli — o zaman çıkış zaten grafik aralığının dışında kalır.",
          "Kutucuk yalnızca alışta çıkar: bir satıştan gelen para her zaman gerçek bir nakit girişidir. Sonradan da işaretleyebilirsin, işlem defterindeki satırı düzenlemen yeterli.",
        ],
      },
      {
        title: "Alış, satış ve ortalama maliyet",
        body: [
          "Aynı varlıktan tekrar alırsan, ortalama maliyetin ağırlıklı ortalama ile güncellenir.",
          "Satış yaptığında ortalama maliyet DEĞİŞMEZ; sadece elindeki adet azalır ve aradaki fark \"Gerçekleşen Kâr/Zarar\"a yazılır.",
          "Adet alanı kesirli değer kabul eder — örneğin 0,3 ons altın ya da 17,5 adet.",
        ],
      },
      {
        title: "Sembolü aramak",
        body: [
          "Sembol kutusuna şirket ya da coin adı yazmaya başla (örn. \"nvidia\" veya \"eczyt\"); Yahoo Finance ve CoinGecko'da canlı arama yapılır.",
          "Doğru sembol formatını (BIST için .IS soneki gibi) ezberlemene gerek yok, listeden seçmen yeterli.",
          "Fiziksel altın için \"Emtia\" türünü seçip GRAM-ALTIN, CEYREK-ALTIN, YARIM-ALTIN veya TAM-ALTIN kullan; TL fiyatı kapalıçarşı kotasyonundan çekilir.",
        ],
      },
      {
        title: "Üstteki dört kart",
        body: [
          "Portföy Değeri: açık pozisyonlarının güncel toplam değeri.",
          "Açık Pozisyon K/Z: henüz satmadıklarının kâğıt üstündeki kâr/zararı.",
          "Gerçekleşen K/Z: satışlarından kesinleşmiş kâr/zarar.",
          "Toplam K/Z: bu ikisinin toplamı, yani genel sonuç.",
        ],
      },
      {
        title: "Açık ve kapanan pozisyonlar",
        body: [
          "Pozisyon tablosundaki filtreyle açık pozisyonlarını, tamamen sattıklarını ya da hepsini bir arada görebilirsin.",
          "Tamamen satılmış bir pozisyon listeden kaybolmaz; \"Kapanan\" filtresinde geçmiş kâr/zararıyla birlikte durur.",
        ],
      },
      {
        title: "Aylık seyir",
        body: [
          "Tablonun altındaki grafik portföyünün aydan aya nasıl değiştiğini gösterir; toplam değer ile toplam kâr/zarar görünümleri arasında geçiş yapabilirsin.",
          "Fiyat geçmişi bugünden itibaren günlük kaydediliyor, bu yüzden piyasa değeri çizgisi zamanla dolacak. Yatırılan maliyet ve gerçekleşen kâr/zarar ise işlem defterinden hesaplandığı için geçmiş aylarda da doğrudur.",
        ],
      },
    ],
  },

  settings: {
    key: "settings",
    pageName: "Ayarlar",
    steps: [
      {
        title: "Baz para birimi",
        body: [
          "Tüm özet ve toplamların hangi para biriminde gösterileceğini burada (ya da sağ üstteki seçiciden) belirlersin.",
          "Kayıtlarını istediğin para biriminde girmeye devam edebilirsin; toplanırken güncel kurla çevrilirler.",
        ],
      },
      {
        title: "Verilerini dışa aktarma",
        body: [
          "Bütün kayıtlarını kendi bilgisayarına indirebilirsin; iki biçim var.",
          "Excel için (.csv): gelir, gider ve kredi taksitleri tek düz tabloda. Türkçe Excel'de doğru açılacak şekilde hazırlanır.",
          "Tam yedek (.json): yatırım, maaş, dönem ve ayar dahil her şey.",
          "İkisi de şifreni içermez. Verin sende de dursun diye ara sıra yedek almanı öneririm.",
        ],
      },
      {
        title: "Maaş ayarları",
        body: [
          "Baz maaş dönemlerin ve referans döviz kurun Maaş sekmesindeki ayarlar sayfasında tutulur.",
          "Bunları girmeden değişken maaş hesaplanamaz; ilk iş olarak oradan bir baz maaş dönemi eklemeni öneririm.",
        ],
      },
    ],
  },
};

import Link from "next/link";

/**
 * Yeni hesabın ilk ekranı.
 *
 * Boş bir hesapta Genel Bakış sıfırlarla dolu kutular ve boş bir grafik
 * gösteriyordu: uygulama bozuk mu, yoksa daha veri mi yok, anlaşılmıyordu.
 * Dokuz sekmeden hangisine önce gidileceği de belli değildi.
 *
 * Sihirbaz değil, KONTROL LİSTESİ: adımlar gerçek veriden okunuyor, yani
 * kullanıcı sırayı bozup doğrudan gider girse bile liste doğru kalıyor ve
 * yarıda kalmış bir akış hissi doğmuyor. Hepsi tamamlanınca liste kaybolur.
 */
export function SetupChecklist({
  hasSalaryRate,
  hasRecord,
  hasBudget,
}: {
  hasSalaryRate: boolean;
  hasRecord: boolean;
  hasBudget: boolean;
}) {
  const adimlar = [
    {
      done: hasSalaryRate,
      title: "Maaşını tanımla",
      description:
        "Hangi tarihten itibaren ne kazandığını ve maaşın sabit mi gün bazlı mı olduğunu gir. Sonra zam aldığında eskisini silme, yeni bir dönem ekle.",
      href: "/salary/settings",
      cta: "Maaş ayarları",
    },
    {
      done: hasRecord,
      title: "İlk kaydını gir",
      description:
        "Bir gider ya da gelir ekle. Kategoriler hazır geldi; grafikler ve bütçeler ilk kayıttan sonra dolmaya başlar.",
      href: "/expenses",
      cta: "Gider ekle",
    },
    {
      done: hasBudget,
      title: "Bir kategoriye aylık sınır koy",
      description:
        "Sınır koyduğun kategoriler Bütçeler sayfasında takip edilir ve aşımda uyarır. Bir tane yeter, sonra çoğaltırsın.",
      href: "/budgets",
      cta: "Bütçeler",
    },
  ];

  const kalan = adimlar.filter((a) => !a.done).length;

  return (
    <section className="border-border border">
      <header className="border-border border-b-2 px-4 py-3">
        <h2 className="t-section">Kuruluma başla</h2>
        <p className="t-body text-muted-foreground mt-1">
          {kalan === adimlar.length
            ? "Üç adım; birkaç dakika sürer."
            : `${adimlar.length - kalan}/${adimlar.length} tamam, ${kalan} adım kaldı.`}
        </p>
      </header>

      <ol className="divide-hairline">
        {adimlar.map((adim, i) => (
          <li
            key={adim.title}
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 gap-3">
              {/*
                Tamamlanan adım soluklaşıyor ama listede kalıyor: kaybolsaydı
                liste her ziyarette başka görünür, kullanıcı nerede kaldığını
                kaybederdi.
              */}
              <span
                aria-hidden
                className={
                  adim.done
                    ? "bg-foreground text-background flex size-6 flex-none items-center justify-center text-[13px] font-bold"
                    : "border-border text-muted-foreground flex size-6 flex-none items-center justify-center border text-[13px] font-bold"
                }
              >
                {adim.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={
                    adim.done
                      ? "text-muted-foreground text-[14px] font-bold line-through"
                      : "text-[14px] font-bold"
                  }
                >
                  {adim.title}
                </p>
                <p className="t-meta mt-0.5 max-w-[60ch]">{adim.description}</p>
              </div>
            </div>
            {!adim.done && (
              <Link
                href={adim.href}
                className="text-accent-text flex-none text-[13px] font-semibold underline underline-offset-4"
              >
                {adim.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

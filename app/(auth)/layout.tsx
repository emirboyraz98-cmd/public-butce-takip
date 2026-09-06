/**
 * Giriş ve kayıt ekranlarının ortak kabuğu.
 *
 * Masaüstünde ikiye bölünmüş ekran: solda dolu kırmızı panel, sağda form.
 * Panel yalnızca süs değil — ürünün ne yaptığını üç satırda söylüyor.
 * Kayıt olmayı düşünen biri bunu başka hiçbir yerde göremiyor: uygulamanın
 * tamamı oturum arkasında.
 *
 * Telefonda panel gizlenmiyor, KISALIYOR: yalnızca ürün adı ve başlık
 * kalıyor. Tamamen kaldırmak, formu bağlamsız bir kutu hâline getiriyordu.
 */
const BENEFITS = [
  "Her ay kendi kuruyla çevrilir; kur değişince geçmiş aylar değişmez.",
  "Ekstre, taksit ve maaş gecikmesi paranın gerçekten çıktığı aya yazılır.",
  "Maaş gün gün hesaplanır; bankaya yatanla karşılaştırılır.",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="bg-primary text-primary-foreground flex flex-col justify-between gap-8 px-6 py-8 lg:px-12 lg:py-14">
        <p className="text-[15px] font-extrabold tracking-[-0.01em]">
          Bütçe Takip
        </p>

        <div>
          <h1 className="text-[30px] leading-[1.08] font-extrabold tracking-[-0.02em] lg:text-[46px]">
            Tek ekrandan bütün finansallarınızı takip edin.
          </h1>

          {/* Paragraf değil, çizgili satırlar: teslimattaki düzen bu ve üç
              cümle aralarında ayrım olmadan tek blok hâlinde okunmuyordu. */}
          <ul className="mt-8 hidden lg:block">
            {BENEFITS.map((text) => (
              <li
                key={text}
                className="border-primary-foreground/30 border-t py-3.5 text-[14px] leading-snug last:border-b"
              >
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-[12px] opacity-80 lg:block">
          Veriler yalnızca senin hesabında; başka kullanıcı göremez.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-10 lg:px-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PageTour } from "@/components/tour/PageTour";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      baseCurrency: true,
      completedTours: true,
      status: true,
      role: true,
    },
  });

  // Oturum, giriş anındaki duruma göre verildi. Aradan geçen sürede üyelik
  // devre dışı bırakılmış olabilir; token süresi dolana kadar erişimin
  // sürmemesi için her sayfa açılışında durum doğrulanır.
  if (user.status !== "ACTIVE") {
    redirect("/login?reason=inactive");
  }

  return (
    // Kabuk 1280px'de sabitlenmiyor, ekranı dolduruyor: teslimattaki 1280px
    // çerçeve tasarım dokümanının sunum çerçevesi, uygulamanın sınırı değil.
    // Kenar çubuğu sabit 236px, içerik akışkan.
    <div className="flex min-h-svh">
      <Sidebar baseCurrency={user.baseCurrency} />
      {/* Alt kenar boşluğu telefondaki sabit sekme çubuğu içindir; onsuz
          sayfanın son satırı çubuğun altında kalıyor. */}
      <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-7 lg:pb-8">
        {children}
      </main>
      <MobileNav
        baseCurrency={user.baseCurrency}
        isAdmin={user.role === "ADMIN"}
      />
      <PageTour completedTours={user.completedTours} />
    </div>
  );
}

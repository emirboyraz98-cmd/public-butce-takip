import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

/**
 * Archivo — teslimatın tek yazı tipi. Başlık ve gövde ayrı aile değil,
 * ayrı AĞIRLIK: 800 başlıklarda, 400/500/600 gövdede. Sistemin sesi
 * fontun kendisinden değil bu ağırlık sıçramasından geliyor.
 *
 * `latin-ext` zorunlu: arayüz Türkçe ve ş/ğ/ı/İ bu alt kümede.
 */
const archivo = Archivo({
  variable: "--font-ui",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "800"],
});

export const metadata: Metadata = {
  title: "Bütçe Takip",
  description: "Kişisel bütçe, yatırım ve maaş takip uygulaması",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthSessionProvider>
            {children}
            <Toaster />
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

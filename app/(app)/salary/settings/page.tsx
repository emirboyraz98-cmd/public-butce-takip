import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BaseSalaryRateForm } from "./base-salary-rate-form";
import { BaseSalaryRateTable } from "./base-salary-rate-table";
import { ReferenceFxRateForm } from "./reference-fx-rate-form";
import { ReferenceFxRateTable } from "./reference-fx-rate-table";
import { PaymentOffsetForm } from "./payment-offset-form";

export default async function SalarySettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, baseSalaryRates, referenceFxRates] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { salaryPaymentMonthOffset: true },
    }),
    prisma.baseSalaryRate.findMany({
      where: { userId },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.referenceFxRate.findMany({
      where: { userId },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);

  /*
   * Referans kur yalnızca değişken hesabın adımı. Hiç dönem girmemiş
   * kullanıcıya da gösteriliyor: ilk dönemini değişken açacaksa kuru önceden
   * girebilsin, yoksa ilk kayıtta "referans kur yok" hatasına çarpardı.
   */
  const hasVariable =
    baseSalaryRates.length === 0 ||
    baseSalaryRates.some((r) => r.mode === "VARIABLE");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/salary"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Maaş ekranına dön
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Maaş Ayarları
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Maaş Ne Zaman Ödeniyor?</CardTitle>
          <CardDescription className="space-y-1">
            <span className="block">
              Maaş genelde çalışıldığı ayın karşılığıdır ama sonraki ay yatar
              (örn. temmuz maaşı 12 ağustosta). Bu ayarı yaparsan{" "}
              <strong>Genel Bakış</strong> maaşı ödendiği aya taşır, böylece
              nakit akışı grafiği gerçekten eline geçen parayı gösterir.
            </span>
            <span className="block">
              <strong>Maaş sekmesi bundan etkilenmez</strong>; orada maaş her
              zaman hak edildiği ayda kalır (&quot;temmuzda çalıştığımın
              karşılığı&quot;). İki sayfa böylece farklı ama net iki soruya
              cevap verir.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentOffsetForm offset={user.salaryPaymentMonthOffset} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Baz Maaş Dönemleri</CardTitle>
          <CardDescription className="space-y-1">
            <span className="block">
              Maaş türü de burada, dönem dönem seçiliyor.{" "}
              <strong>Değişken</strong> dönemde saatlik ücret = baz maaş / 225
              ve tutar USD girilir; ay, takvimde işaretlediğin günlerden
              hesaplanır. <strong>Sabit</strong> dönemde girdiğin tutar,
              dönemi kapsayan her ayın maaşı olarak doğrudan kullanılır —
              formül uygulanmaz, para birimi serbest.
            </span>
            <span className="block">
              İşin değişince eski dönemi kapatıp yenisini başka türde açman
              yeter: <strong>geçmiş aylar kendi yöntemiyle hesaplanmış
              kalır</strong>, yeni aylar yeni yöntemle hesaplanır.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <BaseSalaryRateForm />
          <BaseSalaryRateTable
            rows={baseSalaryRates.map((r) => ({
              id: r.id,
              amount: r.amount.toString(),
              currency: r.currency,
              mode: r.mode,
              effectiveFrom: format(r.effectiveFrom, "yyyy-MM"),
              effectiveTo: r.effectiveTo ? format(r.effectiveTo, "yyyy-MM") : null,
            }))}
          />
        </CardContent>
      </Card>

      {hasVariable && (
        <Card>
          <CardHeader>
            <CardTitle>Referans Kur Dönemleri</CardTitle>
            <CardDescription>
              Şirketin bordroyu TL&apos;ye çevirirken kullandığı sabit kur.
              Değiştiğinde yeni bir dönemle ekleyin. Yalnızca{" "}
              <strong>değişken</strong> dönemlerde kullanılır.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ReferenceFxRateForm />
            <ReferenceFxRateTable
              rows={referenceFxRates.map((r) => ({
                id: r.id,
                rate: r.rate.toString(),
                effectiveFrom: format(r.effectiveFrom, "yyyy-MM"),
                effectiveTo: r.effectiveTo
                  ? format(r.effectiveTo, "yyyy-MM")
                  : null,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
